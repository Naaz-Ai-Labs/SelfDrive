import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { getDb } from "@/lib/db";
import { nextNumber } from "@/lib/utils";
import { calculateCancellationRefund } from "@/lib/pricing";
import { pushNotification } from "@/lib/activity";
import { sendTemplate } from "@/lib/messaging";

function ownedBooking(customerId: number | null, bookingId: number) {
  const db = getDb();
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as
    | { id: number; customer_id: number | null; status: string; paid_amount: number; pickup_at: string; vehicle_id: number }
    | undefined;
  if (!booking) return { error: "Booking not found." } as const;
  if (booking.customer_id && customerId && booking.customer_id !== customerId) return { error: "Not authorised for this booking." } as const;
  return { booking } as const;
}

/** Every action a logged-in customer can take on their own booking (cancel, request a
 * refund, report a problem, leave feedback), dispatched by op to keep the gateway's file
 * count down — each branch mirrors what customerRequestCancellation() etc. used to do
 * as direct server actions in the single-app version. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.op) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = getDb();

  if (body.op === "cancel") {
    const result = ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const now = new Date();
    const pickupAt = new Date(result.booking.pickup_at);

    db.prepare("UPDATE bookings SET status = 'Cancelled', notes = COALESCE(notes || char(10), '') || ? WHERE id = ?").run(
      `Customer cancellation request: ${body.reason ?? ""}`, result.booking.id
    );
    db.prepare("INSERT INTO booking_history (booking_id, action, detail) VALUES (?, 'cancellation_requested', ?)").run(
      result.booking.id, JSON.stringify({ reason: body.reason })
    );

    let refundNo: string | null = null;
    if (result.booking.paid_amount > 0) {
      const refund = await calculateCancellationRefund(pickupAt, now, result.booking.paid_amount);
      refundNo = nextNumber("RF", null);
      db.prepare(
        `INSERT INTO refunds (refund_no, booking_id, customer_id, reason, requested_amount, approved_amount, status, admin_notes, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        refundNo, result.booking.id, customer.customerId, `Cancellation: ${body.reason ?? ""}`, result.booking.paid_amount,
        refund.amount, refund.amount > 0 ? "Approved" : "Rejected", refund.slab, refund.amount > 0 ? new Date().toISOString() : null
      );
      const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','finance') AND is_active = 1").all() as { id: number }[];
      for (const s of staff) pushNotification(s.id, `Refund to process — ${refundNo}`, refund.slab, null, result.booking.id);
    }
    return NextResponse.json({ ok: true, refundNo });
  }

  if (body.op === "refund") {
    const result = ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const refundNo = nextNumber("RF", null);
    db.prepare("INSERT INTO refunds (refund_no, booking_id, customer_id, reason, requested_amount, status) VALUES (?, ?, ?, ?, ?, 'Requested')").run(
      refundNo, result.booking.id, customer.customerId, body.reason ?? "", Number(body.amount ?? 0)
    );
    return NextResponse.json({ ok: true, refundNo });
  }

  if (body.op === "problem") {
    const result = ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const ticketNo = nextNumber("PT", null);
    db.prepare(
      "INSERT INTO problem_tickets (ticket_no, booking_id, vehicle_id, customer_id, category, description, status) VALUES (?, ?, ?, ?, ?, ?, 'Open')"
    ).run(ticketNo, result.booking.id, result.booking.vehicle_id, customer.customerId, body.category ?? "other", body.description ?? "");
    const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager','staff') AND is_active = 1").all() as { id: number }[];
    for (const s of staff) {
      pushNotification(s.id, `Problem reported — ${ticketNo}`, `${String(body.category ?? "other").replace("_", " ")} · booking ${String(result.booking.id)}`, null, result.booking.id);
    }
    const customerRow = db
      .prepare("SELECT c.name, c.phone, b.booking_no FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.id = ?")
      .get(result.booking.id) as { name: string | null; phone: string | null; booking_no: string } | undefined;
    if (customerRow?.phone) {
      try {
        await sendTemplate("problem_ticket_created", customerRow.phone, { name: customerRow.name ?? "", category: String(body.category ?? "other").replace("_", " "), booking_no: customerRow.booking_no }, null, result.booking.id);
      } catch {
        // best-effort — ticket is already recorded regardless
      }
    }
    return NextResponse.json({ ok: true, ticketNo });
  }

  if (body.op === "feedback") {
    if (!customer.customerId) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    db.prepare("INSERT INTO feedback (booking_id, customer_id, rating, review, is_public) VALUES (?, ?, ?, ?, ?)").run(
      Number(body.bookingId), customer.customerId, Number(body.rating), String(body.review ?? ""), body.isPublic ? 1 : 0
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
}
