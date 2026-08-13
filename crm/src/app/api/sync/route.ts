import { NextRequest, NextResponse } from "next/server";
import { sbSelectOne, sbUpdate } from "@/lib/supabase-rest";
import { razorpayConfigured } from "@/lib/razorpay";
import { requireGatewayKey } from "@/lib/gateway-auth";

/**
 * Razorpay reconciliation sweep.
 *
 * This route used to do two things: hydrate the local SQLite mirror from Supabase, and
 * reconcile captured Razorpay payments. Supabase is now read directly everywhere, so the
 * hydration half was copying data into a file nothing reads — it is gone.
 *
 * What remains is the safety net for the webhook: a payment captured at Razorpay whose
 * webhook never arrived (or failed) is picked up here and the booking marked Confirmed.
 * It mutates bookings and payments, so it stays behind the gateway key.
 */
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

  let items: any[];
  try {
    const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/payments?count=20", {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });
    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) {
      return NextResponse.json({ ok: false, error: rzpData?.error?.description || "Razorpay rejected the request." }, { status: 502 });
    }
    items = Array.isArray(rzpData?.items) ? rzpData.items : [];
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Could not reach Razorpay." }, { status: 502 });
  }

  let syncedRazorpayCount = 0;
  const failures: string[] = [];

  for (const item of items) {
    if (item?.status !== "captured" || !item.id) continue;
    const notes = item.notes || {};
    const bookingNo = notes["Booking No"] || notes["booking_no"];
    if (!bookingNo) continue;

    const bookingRes = await sbSelectOne<{ id: number }>(
      "bookings",
      `select=id&booking_no=eq.${encodeURIComponent(String(bookingNo))}`
    );
    if (!bookingRes.ok) {
      failures.push(`${bookingNo}: ${bookingRes.error}`);
      continue;
    }
    if (!bookingRes.data) continue;

    const bookingId = Number(bookingRes.data.id);
    const nowIso = new Date().toISOString();

    // Only rows not already settled are touched, so a re-run does not rewrite paid_at on
    // payments the webhook already reconciled.
    const payment = await sbUpdate<{ id: number }>("payments", `booking_id=eq.${bookingId}&status=neq.Paid`, {
      status: "Paid",
      razorpay_payment_id: item.id,
      paid_at: nowIso,
    });
    if (!payment.ok) {
      failures.push(`${bookingNo}: ${payment.error}`);
      continue;
    }
    if (payment.data.length === 0) continue; // already reconciled

    const booking = await sbUpdate("bookings", `id=eq.${bookingId}`, { status: "Confirmed", updated_at: nowIso });
    if (!booking.ok) {
      failures.push(`${bookingNo}: ${booking.error}`);
      continue;
    }
    syncedRazorpayCount++;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    syncedRazorpayCount,
    failures,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
