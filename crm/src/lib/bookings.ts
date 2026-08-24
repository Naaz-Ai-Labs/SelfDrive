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
import { parseIstInstant, toCanonicalIstIso } from "./rental-clock";
import { getVehicleById, getActiveTermsVersion } from "./data";
import { sbSelect, sbSelectOne, sbInsert, sbUpdate, sbDelete, sbRpc, num } from "./supabase-rest";

export type BookingPayload = {
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  location?: string;
  branchId?: number;
  customer: { name: string; phone: string; email?: string; address?: string; dob?: string; emergencyContact?: string };
  passengers?: number;
  notes?: string;
  enquiryId?: number | null;
  idempotencyKey?: string;
};

/** A booking in one of these states is holding a unit. Cancelled/Completed/Draft are not. */
const BLOCKING_STATUSES = ["Cancelled", "Completed", "Draft", "Rejected"];

function inList(values: Array<string | number>): string {
  return `(${values.map((v) => (typeof v === "number" ? String(v) : `"${v}"`)).join(",")})`;
}

/**
 * Finds a customer by phone or email, or creates one.
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
 * True when the vehicle still has a free physical unit across the requested window and branch.
 */
export async function checkVehicleAvailable(
  vehicleId: number,
  pickupAt: string,
  returnAt: string,
  branchId?: number,
  excludeBookingId?: number
): Promise<boolean> {
  const pickup = encodeURIComponent(pickupAt);
  const ret = encodeURIComponent(returnAt);

  // 1. Verify vehicle model exists and is available
  const vehicleRes = await sbSelectOne<{ id: number; status: string; active: number; total_units: number; branch_id: number | null }>(
    "vehicles",
    `select=id,status,active,total_units,branch_id&id=eq.${vehicleId}`
  );
  if (!vehicleRes.ok || !vehicleRes.data) return false;
  const vData = vehicleRes.data;
  if (
    num(vData.active, 1) === 0 ||
    vData.status === "unavailable" ||
    vData.status === "blocked" ||
    vData.status === "maintenance" ||
    vData.status === "inactive" ||
    vData.status === "archived"
  ) {
    return false;
  }

  // 2. Check if branch is blocked
  const targetBranchId = branchId ?? vData.branch_id ?? undefined;
  if (targetBranchId) {
    const targetBranchRes = await sbSelectOne<{ blocked: number }>("branches", `select=blocked&id=eq.${targetBranchId}`);
    if (targetBranchRes.ok && num(targetBranchRes.data?.blocked) === 1) {
      return false;
    }
  }

  // 3. Check physical units first if available
  const [unitsRes, blockedBranchesRes] = await Promise.all([
    sbSelect<{ id: number; current_branch_id: number | null }>(
      "vehicle_units",
      `select=id,current_branch_id&vehicle_id=eq.${vehicleId}&active=eq.1&status=eq.available`
    ),
    sbSelect<{ id: number }>("branches", "select=id&blocked=eq.1"),
  ]);

  const blockedBranchIds = new Set<number>(
    blockedBranchesRes.ok && blockedBranchesRes.data ? blockedBranchesRes.data.map((b) => Number(b.id)) : []
  );

  if (unitsRes.ok && Array.isArray(unitsRes.data) && unitsRes.data.length > 0) {
    // Exclude units residing in blocked branches
    const units = unitsRes.data.filter((u) => !u.current_branch_id || !blockedBranchIds.has(Number(u.current_branch_id)));
    const unitIds = units.map((u) => Number(u.id));
    if (unitIds.length === 0) return false;

    // Check branch allocations for each unit
    const [allocsRes, blocksRes, bookingsRes] = await Promise.all([
      branchId
        ? sbSelect<{ vehicle_unit_id: number; branch_id: number; starts_at: string; ends_at: string | null }>(
            "branch_allocations",
            `select=vehicle_unit_id,branch_id,starts_at,ends_at&vehicle_unit_id=in.(${unitIds.join(",")})&branch_id=eq.${branchId}&starts_at=lte.${pickup}`
          )
        : Promise.resolve({ ok: true, data: [] }),
      sbSelect<{ vehicle_unit_id: number; booking_id: number | null }>(
        "availability_blocks",
        `select=vehicle_unit_id,booking_id&vehicle_id=eq.${vehicleId}&ends_at=gt.${pickup}&starts_at=lt.${ret}` +
          `${excludeBookingId ? `&or=${encodeURIComponent(`(booking_id.is.null,booking_id.neq.${excludeBookingId})`)}` : ""}`
      ),
      sbSelect<{ id: number; vehicle_unit_id: number | null }>(
        "bookings",
        `select=id,vehicle_unit_id&vehicle_id=eq.${vehicleId}&status=not.in.${encodeURIComponent(inList(BLOCKING_STATUSES))}` +
          `&return_at=gt.${pickup}&pickup_at=lt.${ret}${excludeBookingId ? `&id=neq.${excludeBookingId}` : ""}`
      ),
    ]);

    const blockedUnitIds = new Set<number>();
    if (blocksRes.ok && blocksRes.data) {
      for (const b of blocksRes.data) {
        if (b.vehicle_unit_id) blockedUnitIds.add(Number(b.vehicle_unit_id));
      }
    }
    if (bookingsRes.ok && bookingsRes.data) {
      for (const bk of bookingsRes.data) {
        if (bk.vehicle_unit_id) blockedUnitIds.add(Number(bk.vehicle_unit_id));
      }
    }

    const validUnits = units.filter((u) => {
      if (blockedUnitIds.has(Number(u.id))) return false;
      if (!branchId) return true;
      if (allocsRes.ok && allocsRes.data) {
        const alloc = allocsRes.data.find(
          (a) =>
            Number(a.vehicle_unit_id) === Number(u.id) &&
            (!a.ends_at || new Date(a.ends_at).getTime() >= new Date(returnAt).getTime())
        );
        if (alloc) return true;
      }
      return u.current_branch_id === branchId;
    });

    return validUnits.length > 0;
  }

  // 4. Fallback to model-level total_units check
  const overlap = `return_at=gt.${pickup}&pickup_at=lt.${ret}`;
  const [bookingsRes, blocksRes] = await Promise.all([
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

  if (!bookingsRes.ok || !blocksRes.ok) {
    return false;
  }

  const totalUnits = Math.max(1, num(vData.total_units, 1));
  const bookedIds = new Set(bookingsRes.data.map((b) => Number(b.id)));
  const extraBlocks = blocksRes.data.filter((b) => {
    const bookingId = Number(b.booking_id);
    return !Number.isFinite(bookingId) || !bookedIds.has(bookingId);
  }).length;

  return bookedIds.size + extraBlocks < totalUnits;
}

function makeBookingNo(): string {
  return nextNumber("BK", null);
}

function isUniqueViolation(error: string, status?: number): boolean {
  return status === 409 || /duplicate key|already exists|23505/i.test(error);
}

/**
 * Creates or reuses a customer, computes the quote, and inserts a booking in
 * 'Pending verification' with atomic unit-level slot reservation.
 */
export async function createBooking(payload: BookingPayload): Promise<{ bookingId: number; bookingNo: string; customerId: number }> {
  const vehicle = await getVehicleById(payload.vehicleId);
  if (!vehicle) throw new Error("Vehicle not found");

  // Enforce vehicle availability status invariant
  if (
    vehicle.status === "unavailable" ||
    vehicle.status === "blocked" ||
    vehicle.status === "maintenance" ||
    vehicle.status === "inactive" ||
    vehicle.status === "archived" ||
    num(vehicle.active, 1) === 0
  ) {
    throw new Error("This vehicle is currently unavailable for booking.");
  }

  const pickup = parseIstInstant(payload.pickupAt);
  const ret = parseIstInstant(payload.returnAt);
  if (!pickup || !ret || !(pickup.getTime() < ret.getTime())) {
    throw new Error("Return time must be after pickup time");
  }

  const canonicalPickupAt = toCanonicalIstIso(payload.pickupAt) || payload.pickupAt;
  const canonicalReturnAt = toCanonicalIstIso(payload.returnAt) || payload.returnAt;

  // Resolve target branch ID: explicit branchId -> location string match -> vehicle.branch_id
  let branchId = payload.branchId;
  if (!branchId && payload.location) {
    const locUpper = payload.location.toUpperCase();
    if (locUpper.includes("SAKLESH")) branchId = 1;
    else if (locUpper.includes("HASSAN")) branchId = 2;
  }
  if (!branchId) {
    branchId = vehicle.branch_id ?? undefined;
  }

  // Enforce branch blocked invariant
  if (branchId) {
    const branchRes = await sbSelectOne<{ name: string; blocked: number }>(
      "branches",
      `select=name,blocked&id=eq.${branchId}`
    );
    if (branchRes.ok && num(branchRes.data?.blocked) === 1) {
      throw new Error(`Bookings are temporarily suspended at ${branchRes.data?.name || "this branch"}.`);
    }
  }

  // 1. Try unit-level atomic reservation RPC
  let claimedBlockId: number | null = null;
  let claimedUnitId: number | null = null;

  try {
    const unitClaim = await sbRpc<Array<{ block_id: number; unit_id: number | null; unit_identifier: string | null }>>(
      "reserve_vehicle_unit_slot",
      {
        p_vehicle_id: payload.vehicleId,
        p_pickup_at: canonicalPickupAt,
        p_return_at: canonicalReturnAt,
        p_branch_id: branchId ?? null,
      }
    );

    if (unitClaim.ok && Array.isArray(unitClaim.data) && unitClaim.data.length > 0) {
      claimedBlockId = Number(unitClaim.data[0].block_id);
      claimedUnitId = unitClaim.data[0].unit_id ? Number(unitClaim.data[0].unit_id) : null;
    }
  } catch {
    // Non-critical fallback below
  }

  // 2. If unit claim didn't run, fallback to standard reserve_vehicle_slot
  if (!claimedBlockId) {
    const claim = await sbRpc<number | null>("reserve_vehicle_slot", {
      p_vehicle_id: payload.vehicleId,
      p_pickup_at: canonicalPickupAt,
      p_return_at: canonicalReturnAt,
    });
    if (!claim.ok || !claim.data) {
      throw new Error("This vehicle is not available for the selected dates and branch.");
    }
    claimedBlockId = Number(claim.data);
  }

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
    vehicle_unit_id: claimedUnitId,
    branch_id: branchId ?? null,
    pickup_at: canonicalPickupAt,
    return_at: canonicalReturnAt,
    after_hours: quote.afterHours ? 1 : 0,
    status: "Pending payment",
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
    await sbDelete("availability_blocks", `id=eq.${claimedBlockId}`);
    throw new Error(`Could not save the booking: ${lastError || "the database did not return a booking id."}`);
  }

  // Link availability block to the booking and unit
  const [blockRes, historyRes] = await Promise.all([
    sbUpdate("availability_blocks", `id=eq.${claimedBlockId}`, {
      booking_id: bookingId,
      vehicle_unit_id: claimedUnitId,
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
