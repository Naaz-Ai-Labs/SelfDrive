/**
 * Booking creation, written straight to Supabase.
 *
 * This path used to write to the local SQLite mirror and then fire an un-awaited
 * background upsert to Supabase. On Vercel the lambda freezes the moment the response
 * is returned, so that promise routinely never ran: the customer saw a booking number
 * for a booking that existed only in a temp file that the next cold start deleted.
 * Every write here is awaited, and a failed write is reported as a failure.
 */

import { normalizePhone, nextNumber } from "./utils";
import { logActivity, pushNotification } from "./activity";
import { sendTemplate } from "./messaging";
import { calculateQuote } from "./pricing";
import { getVehicleById, getActiveTermsVersion } from "./data";
import { sbSelect, sbSelectOne, sbInsert, sbUpdate, sbDelete, sbRpc, num } from "./supabase-rest";

export type BookingPayload = {
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  location?: string;
  customer: { name: string; phone: string; email?: string; address?: string; dob?: string; emergencyContact?: string };
  passengers?: number;
  notes?: string;
  enquiryId?: number | null;
};

/** A booking in one of these states is holding a unit. Cancelled/Completed/Draft are not. */
const BLOCKING_STATUSES = ["Cancelled", "Completed", "Draft"];

function inList(values: Array<string | number>): string {
  return `(${values.map((v) => (typeof v === "number" ? String(v) : `"${v}"`)).join(",")})`;
}

/**
 * Finds a customer by phone or email, or creates one.
 *
 * Returns null when the database could not be reached. The old version fell through to
 * `lastInsertRowid` on a mock connection and handed back a customer id that referenced
 * nothing, which then became a booking pointing at a non-existent customer.
 */
export async function findOrCreateCustomer(
  contact: BookingPayload["customer"]
): Promise<{ ok: true; customerId: number } | { ok: false; error: string }> {
  const phone = normalizePhone(contact.phone);
  const email = (contact.email ?? "").toLowerCase().trim();

  const filters: string[] = [];
  if (phone) filters.push(`phone.eq.${phone}`);
  if (email) filters.push(`email.eq.${email}`);

  if (filters.length > 0) {
    const found = await sbSelectOne<{ id: number }>(
      "customers",
      `select=id&or=${encodeURIComponent(`(${filters.join(",")})`)}`
    );
    if (!found.ok) return { ok: false, error: `Could not look up the customer: ${found.error}` };

    if (found.data) {
      const id = Number(found.data.id);
      const patch: Record<string, unknown> = { name: contact.name, updated_at: new Date().toISOString() };
      // COALESCE semantics: only overwrite a column when we actually have a value.
      if (phone) {
        patch.phone = phone;
        patch.whatsapp = phone;
      }
      if (email) patch.email = email;
      if (contact.address) patch.address = contact.address;
      if (contact.dob) patch.date_of_birth = contact.dob;
      if (contact.emergencyContact) patch.emergency_contact = contact.emergencyContact;

      const updated = await sbUpdate("customers", `id=eq.${id}`, patch);
      if (!updated.ok) return { ok: false, error: `Could not update the customer: ${updated.error}` };
      return { ok: true, customerId: id };
    }
  }

  const created = await sbInsert<{ id: number }>("customers", {
    name: contact.name,
    phone: phone || null,
    whatsapp: phone || null,
    email: email || null,
    address: contact.address ?? null,
    date_of_birth: contact.dob ?? null,
    emergency_contact: contact.emergencyContact ?? null,
    source: "Website booking",
  });
  if (!created.ok) return { ok: false, error: `Could not save the customer: ${created.error}` };
  const newId = Number(created.data?.id);
  if (!Number.isFinite(newId) || newId <= 0) return { ok: false, error: "The customer was saved without an id." };
  return { ok: true, customerId: newId };
}

/**
 * True when the vehicle still has a free unit across the requested window.
 *
 * Reads Supabase. The SQLite version silently degraded to a mock that returned no rows,
 * so every vehicle read as available and a single unit could be booked without limit.
 * A failed read now returns false — refusing a bookable vehicle is recoverable, taking
 * money for a double-booked one is not.
 */
export async function checkVehicleAvailable(
  vehicleId: number,
  pickupAt: string,
  returnAt: string,
  excludeBookingId?: number
): Promise<boolean> {
  const pickup = encodeURIComponent(pickupAt);
  const ret = encodeURIComponent(returnAt);

  // Overlap: NOT (return_at <= pickup OR pickup_at >= ret)
  const overlap = `return_at=gt.${pickup}&pickup_at=lt.${ret}`;

  const [vehicleRes, bookingsRes, blocksRes] = await Promise.all([
    sbSelectOne<{ total_units: number }>("vehicles", `select=total_units&id=eq.${vehicleId}`),
    sbSelect<{ id: number }>(
      "bookings",
      `select=id&vehicle_id=eq.${vehicleId}&status=not.in.${encodeURIComponent(inList(BLOCKING_STATUSES))}` +
        `&${overlap}${excludeBookingId ? `&id=neq.${excludeBookingId}` : ""}`
    ),
    sbSelect<{ id: number; booking_id: number | null }>(
      "availability_blocks",
      `select=id,booking_id&vehicle_id=eq.${vehicleId}&ends_at=gt.${pickup}&starts_at=lt.${ret}` +
        `${excludeBookingId ? `&or=${encodeURIComponent(`(booking_id.is.null,booking_id.neq.${excludeBookingId})`)}` : ""}`
    ),
  ]);

  if (!vehicleRes.ok || !bookingsRes.ok || !blocksRes.ok) {
    console.error("[bookings] availability check failed; treating the vehicle as unavailable");
    return false;
  }

  const totalUnits = Math.max(1, num(vehicleRes.data?.total_units, 1));
  const bookedIds = new Set(bookingsRes.data.map((b) => Number(b.id)));
  // A 'booked' block mirrors a booking row; counting both would double-count the same
  // hold. Manual blocks and maintenance have no booking, so they count on their own.
  const extraBlocks = blocksRes.data.filter((b) => {
    const bookingId = Number(b.booking_id);
    return !Number.isFinite(bookingId) || !bookedIds.has(bookingId);
  }).length;

  return bookedIds.size + extraBlocks < totalUnits;
}

/**
 * Builds a booking number.
 *
 * The old `nextNumber("BK", …)` counted from a module-level variable that reset on every
 * cold start, so two lambdas happily minted the same number. `booking_no` is UNIQUE, so
 * the collision surfaced as a failed insert. This mixes the epoch millisecond with
 * randomness, and `createBooking` retries on the unique violation regardless.
 */
/** Delegates to the shared generator so booking numbers get the same entropy as
 * every other reference number. The previous local copy drew from 46,656 random
 * values, which collides across a burst inside one millisecond — survivable here
 * only because the insert retries, but it burned retries for no reason. */
function makeBookingNo(): string {
  return nextNumber("BK", null);
}

function isUniqueViolation(error: string, status?: number): boolean {
  return status === 409 || /duplicate key|already exists|23505/i.test(error);
}

/**
 * Creates or reuses a customer, computes the quote, and inserts a booking in
 * 'Pending verification'. Throws on a validation problem; returns a failure only if a
 * write did not land. Nothing here reports success for a booking that was not persisted.
 */
export async function createBooking(payload: BookingPayload): Promise<{ bookingId: number; bookingNo: string; customerId: number }> {
  const vehicle = await getVehicleById(payload.vehicleId);
  if (!vehicle) throw new Error("Vehicle not found");

  const pickup = new Date(payload.pickupAt);
  const ret = new Date(payload.returnAt);
  if (!(pickup.getTime() < ret.getTime())) throw new Error("Return time must be after pickup time");

  // Atomic claim: reserve_vehicle_slot() checks availability AND inserts the holding
  // block inside one locked transaction, so two concurrent requests for the last
  // free unit cannot both succeed — checkVehicleAvailable() alone is a
  // check-then-insert across two separate calls, which a race can slip through.
  const claim = await sbRpc<number | null>("reserve_vehicle_slot", {
    p_vehicle_id: payload.vehicleId,
    p_pickup_at: payload.pickupAt,
    p_return_at: payload.returnAt,
  });
  if (!claim.ok || !claim.data) {
    throw new Error("This vehicle is not available for the selected dates");
  }
  const claimedBlockId = claim.data;

  const customer = await findOrCreateCustomer(payload.customer);
  if (!customer.ok) throw new Error(customer.error);
  const customerId = customer.customerId;

  const quote = await calculateQuote(vehicle, pickup, ret);
  if (quote.belowWeekendMinimum) {
    throw new Error(`Weekend bookings need a minimum of ${quote.weekendMinDays} days for this vehicle.`);
  }
  const terms = await getActiveTermsVersion();
  const otherFees = num(quote.offSchedulePickupFee) + num(quote.gatewayFeeAmount);
  const nowIso = new Date().toISOString();

  const row = {
    enquiry_id: payload.enquiryId ?? null,
    customer_id: customerId,
    vehicle_id: vehicle.id,
    branch_id: vehicle.branch_id,
    pickup_at: payload.pickupAt,
    return_at: payload.returnAt,
    after_hours: quote.afterHours ? 1 : 0,
    status: "Pending verification",
    base_amount: num(quote.baseAmount),
    gst_amount: num(quote.gstAmount),
    deposit_amount: num(quote.depositAmount),
    other_fees_amount: otherFees,
    extra_km_amount: 0,
    late_fee_amount: 0,
    damage_amount: 0,
    total_amount: num(quote.totalAmount),
    included_km: num(quote.includedKm),
    terms_version_id: terms?.id ?? null,
    notes: payload.notes ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  // Retry on the unique violation rather than trusting the generated number to be free.
  let bookingId = 0;
  let bookingNo = "";
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = makeBookingNo();
    const inserted = await sbInsert<{ id: number; booking_no: string }>("bookings", { ...row, booking_no: candidate });
    if (inserted.ok) {
      bookingId = Number(inserted.data?.id);
      bookingNo = String(inserted.data?.booking_no ?? candidate);
      break;
    }
    lastError = inserted.error;
    if (!isUniqueViolation(inserted.error, inserted.status)) break;
  }

  if (!bookingId || !Number.isFinite(bookingId)) {
    // The slot was already claimed by reserve_vehicle_slot(). If the booking itself
    // never got created, release it — otherwise that unit stays phantom-booked
    // forever with no booking to show for it.
    await sbDelete("availability_blocks", `id=eq.${claimedBlockId}`);
    throw new Error(`Could not save the booking: ${lastError || "the database did not return a booking id."}`);
  }

  // Link the slot claimed atomically above to the real booking — never insert a
  // second block for the same hold, that would double-count against total_units.
  const [blockRes, historyRes] = await Promise.all([
    sbUpdate("availability_blocks", `id=eq.${claimedBlockId}`, {
      booking_id: bookingId,
      notes: null,
    }),
    sbInsert("booking_history", {
      booking_id: bookingId,
      action: "created",
      detail: JSON.stringify({ vehicle: vehicle.name, total: num(quote.totalAmount) }),
      created_at: nowIso,
    }),
  ]);
  if (!blockRes.ok) console.error(`[bookings] ${bookingNo}: availability block not linked — ${blockRes.error}`);
  if (!historyRes.ok) console.error(`[bookings] ${bookingNo}: history row not written — ${historyRes.error}`);

  await logActivity(null, "booking_created", "booking", bookingId, { booking_no: bookingNo, vehicle: vehicle.name });

  const admins = await sbSelect<{ id: number }>(
    "users",
    `select=id&role=in.${encodeURIComponent(inList(["admin", "manager"]))}&is_active=eq.1`
  );
  if (admins.ok) {
    for (const admin of admins.data) {
      await pushNotification(Number(admin.id), `New booking ${bookingNo}`, `${payload.customer.name} · ${vehicle.name}`, null, bookingId);
    }
  }

  try {
    await sendTemplate(
      "booking_submitted",
      normalizePhone(payload.customer.phone),
      { name: payload.customer.name, booking_no: bookingNo, vehicle: vehicle.name, pickup_at: payload.pickupAt },
      null,
      bookingId
    );
  } catch {
    // best-effort
  }

  return { bookingId, bookingNo, customerId };
}

export async function acceptBookingTerms(bookingId: number, termsVersionId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await sbUpdate("bookings", `id=eq.${bookingId}`, {
    terms_version_id: termsVersionId,
    terms_accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
