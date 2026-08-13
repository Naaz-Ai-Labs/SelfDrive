import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { sbSelectOne, sbInsert, sbUpdate, num } from "@/lib/supabase-rest";
import { nextNumber } from "@/lib/utils";
import { calculateCancellationRefund } from "@/lib/pricing";
import { notifyRoles } from "@/lib/activity";
import { sendTemplate } from "@/lib/messaging";

type PortalBooking = {
  id: number;
  customer_id: number | null;
  status: string;
  paid_amount: number;
  pickup_at: string;
  vehicle_id: number | null;
  notes: string | null;
};

async function ownedBooking(customerId: number | null, bookingId: number) {
  if (!Number.isFinite(bookingId)) return { error: "Booking not found." } as const;

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
    // NUMERIC columns arrive as strings over PostgREST.
    paid_amount: num(raw.paid_amount),
    pickup_at: String(raw.pickup_at ?? ""),
    vehicle_id: raw.vehicle_id === null || raw.vehicle_id === undefined ? null : Number(raw.vehicle_id),
    notes: raw.notes === null || raw.notes === undefined ? null : String(raw.notes),
  };

  if (booking.customer_id && customerId && booking.customer_id !== customerId) {
    return { error: "Not authorised for this booking." } as const;
  }
  return { booking } as const;
}

/** Every action a logged-in customer can take on their own booking (cancel, request a
 * refund, report a problem, leave feedback), dispatched by op to keep the gateway's file
 * count down — each branch mirrors what customerRequestCancellation() etc. used to do
 * as direct server actions in the single-app version.
 *
 * Every write is awaited and checked: this route used to answer `{ ok: true }` off a
 * SQLite mock whose inserts went nowhere. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.op) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (body.op === "cancel") {
    const result = await ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const now = new Date();
    const pickupAt = new Date(result.booking.pickup_at);
    const note = `Customer cancellation request: ${body.reason ?? ""}`;

    const cancelled = await sbUpdate("bookings", `id=eq.${result.booking.id}`, {
      status: "Cancelled",
      notes: result.booking.notes ? `${result.booking.notes}\n${note}` : note,
      updated_at: now.toISOString(),
    });
    if (!cancelled.ok) return NextResponse.json({ error: `Could not cancel the booking: ${cancelled.error}` }, { status: 502 });

    const history = await sbInsert("booking_history", {
      booking_id: result.booking.id,
      action: "cancellation_requested",
      detail: JSON.stringify({ reason: body.reason }),
      created_at: now.toISOString(),
    });
    if (!history.ok) console.error("[portal] cancellation history not recorded:", history.error);

    let refundNo: string | null = null;
    if (result.booking.paid_amount > 0) {
      const refund = await calculateCancellationRefund(pickupAt, now, result.booking.paid_amount);
      refundNo = nextNumber("RF", null);
      const inserted = await sbInsert("refunds", {
        refund_no: refundNo,
        booking_id: result.booking.id,
        customer_id: customer.customerId,
        reason: `Cancellation: ${body.reason ?? ""}`,
        requested_amount: result.booking.paid_amount,
        approved_amount: refund.amount,
        status: refund.amount > 0 ? "Approved" : "Rejected",
        admin_notes: refund.slab,
        requested_at: now.toISOString(),
        approved_at: refund.amount > 0 ? new Date().toISOString() : null,
      });
      if (!inserted.ok) {
        return NextResponse.json(
          { error: `The booking was cancelled but the refund could not be raised: ${inserted.error}` },
          { status: 502 }
        );
      }
      await notifyRoles(["admin", "finance"], `Refund to process — ${refundNo}`, refund.slab, null, result.booking.id);
    }
    return NextResponse.json({ ok: true, refundNo });
  }

  if (body.op === "refund") {
    const result = await ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const refundNo = nextNumber("RF", null);
    const inserted = await sbInsert("refunds", {
      refund_no: refundNo,
      booking_id: result.booking.id,
      customer_id: customer.customerId,
      reason: body.reason ?? "",
      requested_amount: Number(body.amount ?? 0),
      status: "Requested",
      requested_at: new Date().toISOString(),
    });
    if (!inserted.ok) return NextResponse.json({ error: `Could not raise the refund request: ${inserted.error}` }, { status: 502 });
    return NextResponse.json({ ok: true, refundNo });
  }

  if (body.op === "problem") {
    const result = await ownedBooking(customer.customerId, Number(body.bookingId));
    if ("error" in result) return NextResponse.json(result, { status: 403 });
    const ticketNo = nextNumber("PT", null);
    const inserted = await sbInsert("problem_tickets", {
      ticket_no: ticketNo,
      booking_id: result.booking.id,
      vehicle_id: result.booking.vehicle_id,
      customer_id: customer.customerId,
      category: body.category ?? "other",
      description: body.description ?? "",
      status: "Open",
      created_at: new Date().toISOString(),
    });
    if (!inserted.ok) return NextResponse.json({ error: `Could not report the problem: ${inserted.error}` }, { status: 502 });

    await notifyRoles(
      ["admin", "manager", "staff"],
      `Problem reported — ${ticketNo}`,
      `${String(body.category ?? "other").replace("_", " ")} · booking ${String(result.booking.id)}`,
      null,
      result.booking.id
    );

    const contactRes = await sbSelectOne<{ booking_no: string; customers: { name: string | null; phone: string | null } | null }>(
      "bookings",
      `select=booking_no,customers(name,phone)&id=eq.${result.booking.id}`
    );
    const contact = contactRes.ok ? contactRes.data : null;
    if (contact?.customers?.phone) {
      try {
        await sendTemplate(
          "problem_ticket_created",
          contact.customers.phone,
          {
            name: contact.customers.name ?? "",
            category: String(body.category ?? "other").replace("_", " "),
            booking_no: contact.booking_no,
          },
          null,
          result.booking.id
        );
      } catch {
        // best-effort — ticket is already recorded regardless
      }
    }
    return NextResponse.json({ ok: true, ticketNo });
  }

  if (body.op === "feedback") {
    if (!customer.customerId) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    const inserted = await sbInsert("feedback", {
      booking_id: Number(body.bookingId),
      customer_id: customer.customerId,
      rating: Number(body.rating),
      review: String(body.review ?? ""),
      // `is_public` is INTEGER in the schema, not boolean.
      is_public: body.isPublic ? 1 : 0,
      created_at: new Date().toISOString(),
    });
    if (!inserted.ok) return NextResponse.json({ error: `Could not save your feedback: ${inserted.error}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
}
