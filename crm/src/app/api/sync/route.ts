import { NextRequest, NextResponse } from "next/server";
import { sbSelectOne, sbUpdate, sbRpc } from "@/lib/supabase-rest";
import { razorpayConfigured } from "@/lib/razorpay";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { epochSecondsToUtcIso, nowUtcIso } from "@/lib/time";

/**
 * Razorpay reconciliation sweep — the safety net behind the webhook.
 *
 * A payment captured at Razorpay whose webhook never arrived (or failed) is picked up
 * here and applied to the booking.
 *
 * The previous version matched on a `Booking No` note that no order has ever carried:
 * pre-booking checkout has no booking number yet (the booking is only created once
 * payment verifies), and the notes it does write are Customer/Phone/Base Rental/GST/
 * Deposit/Paid Online Now. Every payment therefore hit `if (!bookingNo) continue` and
 * the sweep reconciled nothing in its entire lifetime.
 *
 * Matching now uses identifiers that actually exist on the row, in descending order of
 * reliability, and a payment with no local row at all is reported as an orphan rather
 * than silently skipped — an orphan means money was captured with no booking behind it
 * and needs a human.
 */

type PaymentRow = {
  id: number;
  booking_id: number | null;
  status: string;
  payment_no: string;
};

/**
 * Resolves the local payments row for a Razorpay payment. Razorpay's `receipt` is set
 * to our payment_no at order creation, which is what makes the third lookup possible
 * for orders created through the web app's direct fallback path.
 */
async function findLocalPayment(item: {
  id: string;
  order_id?: string | null;
  receipt?: string | null;
}): Promise<PaymentRow | null> {
  const byPayment = await sbSelectOne<PaymentRow>(
    "payments",
    `select=id,booking_id,status,payment_no&razorpay_payment_id=eq.${encodeURIComponent(item.id)}`
  );
  if (byPayment.ok && byPayment.data) return byPayment.data;

  if (item.order_id) {
    const enc = encodeURIComponent(item.order_id);
    const byOrder = await sbSelectOne<PaymentRow>(
      "payments",
      `select=id,booking_id,status,payment_no&or=(razorpay_order_id.eq.${enc},gateway_ref.eq.${enc})`
    );
    if (byOrder.ok && byOrder.data) return byOrder.data;
  }

  if (item.receipt) {
    const byReceipt = await sbSelectOne<PaymentRow>(
      "payments",
      `select=id,booking_id,status,payment_no&payment_no=eq.${encodeURIComponent(item.receipt)}`
    );
    if (byReceipt.ok && byReceipt.data) return byReceipt.data;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;

  if (!razorpayConfigured()) {
    return NextResponse.json({ ok: true, skipped: "Razorpay is not configured.", syncedRazorpayCount: 0 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json({ ok: false, error: "Razorpay credentials are incomplete." }, { status: 500 });
  }

  // Reservations whose 15-minute window lapsed with no payment. Runs here too so the
  // CRM self-corrects even on a day with no new bookings to trigger the sweep.
  const sweptReservations = await sbRpc<number>("release_expired_reservations", {});
  if (!sweptReservations.ok) console.error(`[sync] expired-reservation sweep failed — ${sweptReservations.error}`);

  let items: any[];
  try {
    const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/payments?count=100", {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });
    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) {
      return NextResponse.json(
        { ok: false, error: rzpData?.error?.description || "Razorpay rejected the request." },
        { status: 502 }
      );
    }
    items = Array.isArray(rzpData?.items) ? rzpData.items : [];
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Could not reach Razorpay." }, { status: 502 });
  }

  let syncedRazorpayCount = 0;
  const failures: string[] = [];
  /** Captured at Razorpay with no local payment row — money in, no booking. */
  const orphans: Array<{
    razorpayPaymentId: string;
    razorpayOrderId: string | null;
    amount: number;
    capturedAt: string;
    contact: string | null;
    customer: string | null;
  }> = [];

  for (const item of items) {
    if (item?.status !== "captured" || !item.id) continue;

    const local = await findLocalPayment(item);

    if (!local) {
      orphans.push({
        razorpayPaymentId: item.id,
        razorpayOrderId: item.order_id ?? null,
        amount: Number(item.amount || 0) / 100,
        capturedAt: epochSecondsToUtcIso(item.created_at),
        contact: item.contact ?? item.notes?.Phone ?? null,
        customer: item.notes?.Customer ?? null,
      });
      continue;
    }

    if (local.status === "Paid") continue; // already reconciled

    // Razorpay's created_at is Unix epoch seconds (UTC). Stored as ISO-8601 UTC so it
    // sorts and compares against every other timestamp in the system; rendering to IST
    // happens at the display boundary, never here.
    const capturedAtIso = epochSecondsToUtcIso(item.created_at);

    const payment = await sbUpdate<{ id: number }>("payments", `id=eq.${local.id}&status=neq.Paid`, {
      status: "Paid",
      razorpay_payment_id: item.id,
      gateway_ref: item.id,
      paid_at: capturedAtIso,
    });
    if (!payment.ok) {
      failures.push(`${local.payment_no}: ${payment.error}`);
      continue;
    }
    if (payment.data.length === 0) continue; // raced with the webhook — it won, fine

    if (local.booking_id) {
      const booking = await sbUpdate("bookings", `id=eq.${local.booking_id}`, {
        status: "Confirmed",
        updated_at: nowUtcIso(),
      });
      if (!booking.ok) {
        failures.push(`${local.payment_no}: ${booking.error}`);
        continue;
      }
    } else {
      // Paid, but the booking was never created (verify callback never completed).
      // The payment row is now correctly marked Paid so it stops looking Pending, but
      // a human still has to build the booking — surface it rather than bury it.
      orphans.push({
        razorpayPaymentId: item.id,
        razorpayOrderId: item.order_id ?? null,
        amount: Number(item.amount || 0) / 100,
        capturedAt: capturedAtIso,
        contact: item.contact ?? item.notes?.Phone ?? null,
        customer: item.notes?.Customer ?? null,
      });
    }

    syncedRazorpayCount++;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    syncedRazorpayCount,
    expiredReservationsReleased: sweptReservations.ok ? sweptReservations.data : null,
    orphanCount: orphans.length,
    orphans,
    failures,
    timestamp: nowUtcIso(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
