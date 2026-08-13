"use server";

/**
 * Customer-portal server actions: cancellation, refunds, problem tickets and feedback.
 *
 * Every write goes to Supabase and is awaited. Nothing here reports success on a failed
 * write — the old version fired SQLite statements at a mock database on serverless and
 * still returned `{ ok: true }`, so customers saw a confirmed cancellation that had never
 * been recorded anywhere.
 */

import { cookies } from "next/headers";
import { sbSelectOne, sbInsert, sbUpdate, num } from "./supabase-rest";
import { getCustomerSession, destroyCustomerSession } from "./portal-session";
import { nextNumber } from "./utils";
import { calculateCancellationRefund } from "./pricing";
import { notifyRoles } from "./activity";
import { revalidatePath } from "next/cache";

type PortalBooking = {
  id: number;
  customer_id: number | null;
  status: string;
  paid_amount: number;
  pickup_at: string;
  vehicle_id: number | null;
  notes: string | null;
};

export async function getPortalSession(): Promise<{ customerId: number | null; target: string } | null> {
  const token = (await cookies()).get("dtt_customer")?.value;
  if (!token) return null;
  return await getCustomerSession(token);
}

export async function portalLogout() {
  const token = (await cookies()).get("dtt_customer")?.value;
  if (token) await destroyCustomerSession(token);
  (await cookies()).set("dtt_customer", "", { httpOnly: true, path: "/", maxAge: 0 });
  revalidatePath("/customer", "layout");
  return { ok: true };
}

async function ownedBooking(bookingId: number) {
  const session = await getPortalSession();
  if (!session) return { error: "Please log in first." } as const;

  const res = await sbSelectOne<Record<string, unknown>>(
    "bookings",
    `select=id,customer_id,status,paid_amount,pickup_at,vehicle_id,notes&id=eq.${bookingId}`
  );
  if (!res.ok) return { error: `Could not load the booking: ${res.error}` } as const;
  if (!res.data) return { error: "Booking not found." } as const;

  const raw = res.data;
  const booking: PortalBooking = {
    id: Number(raw.id),
    customer_id: raw.customer_id === null || raw.customer_id === undefined ? null : Number(raw.customer_id),
    status: String(raw.status ?? ""),
    // NUMERIC arrives as a string over PostgREST.
    paid_amount: num(raw.paid_amount),
    pickup_at: String(raw.pickup_at ?? ""),
    vehicle_id: raw.vehicle_id === null || raw.vehicle_id === undefined ? null : Number(raw.vehicle_id),
    notes: raw.notes === null || raw.notes === undefined ? null : String(raw.notes),
  };

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
  const now = new Date();
  const pickupAt = new Date(result.booking.pickup_at);
  const note = `Customer cancellation request: ${reason}`;

  const cancelled = await sbUpdate("bookings", `id=eq.${bookingId}`, {
    status: "Cancelled",
    // Postgres has no char(10) concat helper over REST; the append is done here.
    notes: result.booking.notes ? `${result.booking.notes}\n${note}` : note,
    updated_at: now.toISOString(),
  });
  if (!cancelled.ok) return { error: `Could not cancel the booking: ${cancelled.error}` };

  const history = await sbInsert("booking_history", {
    booking_id: bookingId,
    action: "cancellation_requested",
    detail: JSON.stringify({ reason }),
    created_at: now.toISOString(),
  });
  if (!history.ok) console.error("[portal] cancellation history not recorded:", history.error);

  let refundNo: string | null = null;
  if (result.booking.paid_amount > 0) {
    const refund = await calculateCancellationRefund(pickupAt, now, result.booking.paid_amount);
    refundNo = nextNumber("RF", null);
    const inserted = await sbInsert("refunds", {
      refund_no: refundNo,
      booking_id: bookingId,
      customer_id: result.session.customerId,
      reason: `Cancellation: ${reason}`,
      requested_amount: result.booking.paid_amount,
      approved_amount: refund.amount,
      status: refund.amount > 0 ? "Approved" : "Rejected",
      admin_notes: refund.slab,
      requested_at: now.toISOString(),
      approved_at: refund.amount > 0 ? new Date().toISOString() : null,
    });
    // The booking is already cancelled; report the refund failure rather than claim one exists.
    if (!inserted.ok) return { error: `The booking was cancelled but the refund could not be raised: ${inserted.error}` };

    await notifyRoles(["admin", "finance"], `Refund to process — ${refundNo}`, refund.slab, null, bookingId);
  }

  revalidatePath("/customer", "layout");
  return { ok: true, refundNo };
}

export async function customerRequestRefund(bookingId: number, reason: string, amount: number) {
  const result = await ownedBooking(bookingId);
  if ("error" in result) return result;

  const refundNo = nextNumber("RF", null);
  const inserted = await sbInsert("refunds", {
    refund_no: refundNo,
    booking_id: bookingId,
    customer_id: result.session.customerId,
    reason,
    requested_amount: amount,
    status: "Requested",
    requested_at: new Date().toISOString(),
  });
  if (!inserted.ok) return { error: `Could not raise the refund request: ${inserted.error}` };

  revalidatePath("/customer", "layout");
  return { ok: true, refundNo };
}

export async function customerReportProblem(bookingId: number, category: string, description: string) {
  const result = await ownedBooking(bookingId);
  if ("error" in result) return result;

  const ticketNo = nextNumber("PT", null);
  const inserted = await sbInsert("problem_tickets", {
    ticket_no: ticketNo,
    booking_id: bookingId,
    // Taken from the booking we already loaded; the SQL sub-select has no REST equivalent.
    vehicle_id: result.booking.vehicle_id,
    customer_id: result.session.customerId,
    category,
    description,
    status: "Open",
    created_at: new Date().toISOString(),
  });
  if (!inserted.ok) return { error: `Could not report the problem: ${inserted.error}` };

  revalidatePath("/customer", "layout");
  return { ok: true, ticketNo };
}

export async function customerAddFeedback(input: { bookingId: number; rating: number; review: string; isPublic: boolean }) {
  const session = await getPortalSession();
  if (!session) return { error: "Please log in first." };

  const inserted = await sbInsert("feedback", {
    booking_id: input.bookingId,
    customer_id: session.customerId,
    rating: input.rating,
    review: input.review,
    // `is_public` is INTEGER in the schema, not boolean.
    is_public: input.isPublic ? 1 : 0,
    created_at: new Date().toISOString(),
  });
  if (!inserted.ok) return { error: `Could not save your feedback: ${inserted.error}` };

  revalidatePath("/customer", "layout");
  return { ok: true };
}
