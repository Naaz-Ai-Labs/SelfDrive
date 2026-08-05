"use server";

import { cookies } from "next/headers";
import { getDb } from "./db";
import { getCustomerSession, destroyCustomerSession } from "./portal-session";
import { nextNumber } from "./utils";
import { calculateCancellationRefund } from "./pricing";
import { pushNotification } from "./activity";
import { revalidatePath } from "next/cache";

export async function getPortalSession(): Promise<{ customerId: number | null; target: string } | null> {
  const token = (await cookies()).get("dtt_customer")?.value;
  if (!token) return null;
  return getCustomerSession(token);
}

export async function portalLogout() {
  const token = (await cookies()).get("dtt_customer")?.value;
  if (token) destroyCustomerSession(token);
  (await cookies()).set("dtt_customer", "", { httpOnly: true, path: "/", maxAge: 0 });
  revalidatePath("/customer", "layout");
  return { ok: true };
}

async function ownedBooking(bookingId: number) {
  const session = await getPortalSession();
  if (!session) return { error: "Please log in first." } as const;
  const db = getDb();
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as { id: number; customer_id: number | null; status: string; paid_amount: number; pickup_at: string } | undefined;
  if (!booking) return { error: "Booking not found." } as const;
  if (booking.customer_id && session.customerId && booking.customer_id !== session.customerId) {
    return { error: "Not authorised for this booking." } as const;
  }
  return { session, booking } as const;
}

/** Cancels the booking and — if anything was paid — raises a refund pre-approved at the
 * published policy amount for the reviewer to see; staff still complete the actual bank
 * transfer, so no money moves without a recorded human step. */
export async function customerRequestCancellation(bookingId: number, reason: string) {
  const result = await ownedBooking(bookingId);
  if ("error" in result) return result;
  const db = getDb();
  const now = new Date();
  const pickupAt = new Date(result.booking.pickup_at);

  db.prepare("UPDATE bookings SET status = 'Cancelled', notes = COALESCE(notes || char(10), '') || ? WHERE id = ?").run(
    `Customer cancellation request: ${reason}`, bookingId
  );
  db.prepare("INSERT INTO booking_history (booking_id, action, detail) VALUES (?, 'cancellation_requested', ?)").run(
    bookingId, JSON.stringify({ reason })
  );

  let refundNo: string | null = null;
  if (result.booking.paid_amount > 0) {
    const refund = calculateCancellationRefund(pickupAt, now, result.booking.paid_amount);
    refundNo = nextNumber("RF", null);
    db.prepare(
      `INSERT INTO refunds (refund_no, booking_id, customer_id, reason, requested_amount, approved_amount, status, admin_notes, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      refundNo, bookingId, result.session.customerId, `Cancellation: ${reason}`, result.booking.paid_amount,
      refund.amount, refund.amount > 0 ? "Approved" : "Rejected", refund.slab, refund.amount > 0 ? new Date().toISOString() : null
    );
    const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','finance') AND is_active = 1").all() as { id: number }[];
    for (const s of staff) pushNotification(s.id, `Refund to process — ${refundNo}`, refund.slab, null, bookingId);
  }

  revalidatePath("/customer", "layout");
  return { ok: true, refundNo };
}

export async function customerRequestRefund(bookingId: number, reason: string, amount: number) {
  const result = await ownedBooking(bookingId);
  if ("error" in result) return result;
  const db = getDb();
  const refundNo = nextNumber("RF", null);
  db.prepare(
    "INSERT INTO refunds (refund_no, booking_id, customer_id, reason, requested_amount, status) VALUES (?, ?, ?, ?, ?, 'Requested')"
  ).run(refundNo, bookingId, result.session.customerId, reason, amount);
  revalidatePath("/customer", "layout");
  return { ok: true, refundNo };
}

export async function customerReportProblem(bookingId: number, category: string, description: string) {
  const result = await ownedBooking(bookingId);
  if ("error" in result) return result;
  const db = getDb();
  const ticketNo = nextNumber("PT", null);
  db.prepare(
    "INSERT INTO problem_tickets (ticket_no, booking_id, vehicle_id, customer_id, category, description, status) VALUES (?, ?, (SELECT vehicle_id FROM bookings WHERE id = ?), ?, ?, ?, 'Open')"
  ).run(ticketNo, bookingId, bookingId, result.session.customerId, category, description);
  revalidatePath("/customer", "layout");
  return { ok: true, ticketNo };
}

export async function customerAddFeedback(input: { bookingId: number; rating: number; review: string; isPublic: boolean }) {
  const session = await getPortalSession();
  if (!session) return { error: "Please log in first." };
  const db = getDb();
  db.prepare("INSERT INTO feedback (booking_id, customer_id, rating, review, is_public) VALUES (?, ?, ?, ?, ?)").run(
    input.bookingId, session.customerId, input.rating, input.review, input.isPublic ? 1 : 0
  );
  revalidatePath("/customer", "layout");
  return { ok: true };
}
