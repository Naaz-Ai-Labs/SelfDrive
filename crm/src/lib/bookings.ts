import { getDb } from "./db";
import { nextNumber, normalizePhone } from "./utils";
import { logActivity, pushNotification } from "./activity";
import { sendTemplate } from "./messaging";
import { calculateQuote } from "./pricing";
import { getVehicleById, getActiveTermsVersion } from "./data";

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

function findOrCreateCustomer(contact: BookingPayload["customer"]): number {
  const db = getDb();
  const phone = normalizePhone(contact.phone);
  const email = (contact.email ?? "").toLowerCase().trim();
  const existing = db
    .prepare("SELECT id FROM customers WHERE (phone = ? AND phone != '') OR (email = ? AND email != '') LIMIT 1")
    .get(phone, email) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE customers SET name = ?, phone = COALESCE(?, phone), whatsapp = COALESCE(?, whatsapp), email = COALESCE(?, email), address = COALESCE(?, address), date_of_birth = COALESCE(?, date_of_birth), emergency_contact = COALESCE(?, emergency_contact), updated_at = datetime('now') WHERE id = ?"
    ).run(contact.name, phone, phone, email || null, contact.address ?? null, contact.dob ?? null, contact.emergencyContact ?? null, existing.id);
    return existing.id;
  }
  const result = db
    .prepare(
      "INSERT INTO customers (name, phone, whatsapp, email, address, date_of_birth, emergency_contact, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'Website booking')"
    )
    .run(contact.name, phone, phone, email || null, contact.address ?? null, contact.dob ?? null, contact.emergencyContact ?? null);
  return Number(result.lastInsertRowid);
}

export function checkVehicleAvailable(vehicleId: number, pickupAt: string, returnAt: string, excludeBookingId?: number): boolean {
  const db = getDb();
  const vehicle = db.prepare("SELECT total_units FROM vehicles WHERE id = ?").get(vehicleId) as { total_units: number } | undefined;
  const totalUnits = vehicle?.total_units ?? 1;

  const clashes = db
    .prepare(
      `SELECT id FROM bookings
       WHERE vehicle_id = ?
         AND status NOT IN ('Cancelled', 'Completed', 'Draft')
         AND NOT (return_at <= ? OR pickup_at >= ?)
         ${excludeBookingId ? "AND id != ?" : ""}`
    )
    .all(...(excludeBookingId ? [vehicleId, pickupAt, returnAt, excludeBookingId] : [vehicleId, pickupAt, returnAt])) as Array<{ id: number }>;
  return clashes.length < totalUnits;
}

/** Creates or reuses a customer, computes the quote, and inserts a booking in 'Pending verification' status. */
export function createBooking(payload: BookingPayload): { bookingId: number; bookingNo: string; customerId: number } {
  const db = getDb();
  const vehicle = getVehicleById(payload.vehicleId);
  if (!vehicle) throw new Error("Vehicle not found");

  const pickup = new Date(payload.pickupAt);
  const ret = new Date(payload.returnAt);
  if (!(pickup.getTime() < ret.getTime())) throw new Error("Return time must be after pickup time");
  if (!checkVehicleAvailable(payload.vehicleId, payload.pickupAt, payload.returnAt)) {
    throw new Error("This vehicle is not available for the selected dates");
  }

  const customerId = findOrCreateCustomer(payload.customer);
  const quote = calculateQuote(vehicle, pickup, ret);
  if (quote.belowWeekendMinimum) {
    throw new Error(`Weekend bookings need a minimum of ${quote.weekendMinDays} days for this vehicle.`);
  }
  const terms = getActiveTermsVersion();
  const bookingNo = nextNumber("BK", null);
  const otherFees = quote.offSchedulePickupFee + quote.gatewayFeeAmount;

  const result = db
    .prepare(
      `INSERT INTO bookings (
        booking_no, enquiry_id, customer_id, vehicle_id, branch_id, pickup_at, return_at, after_hours, status,
        base_amount, gst_amount, deposit_amount, other_fees_amount, extra_km_amount, late_fee_amount, damage_amount, total_amount,
        included_km, terms_version_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending verification', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`
    )
    .run(
      bookingNo, payload.enquiryId ?? null, customerId, vehicle.id, vehicle.branch_id, payload.pickupAt, payload.returnAt, quote.afterHours ? 1 : 0,
      quote.baseAmount, quote.gstAmount, quote.depositAmount, otherFees, quote.totalAmount, quote.includedKm, terms?.id ?? null, payload.notes ?? null
    );
  const bookingId = Number(result.lastInsertRowid);

  db.prepare("INSERT INTO availability_blocks (vehicle_id, starts_at, ends_at, reason, booking_id) VALUES (?, ?, ?, 'booked', ?)").run(
    vehicle.id, payload.pickupAt, payload.returnAt, bookingId
  );

  db.prepare("INSERT INTO booking_history (booking_id, action, detail) VALUES (?, 'created', ?)").run(
    bookingId, JSON.stringify({ vehicle: vehicle.name, total: quote.totalAmount })
  );
  logActivity(null, "booking_created", "booking", bookingId, { booking_no: bookingNo, vehicle: vehicle.name });

  const admins = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1").all() as { id: number }[];
  for (const admin of admins) {
    pushNotification(admin.id, `New booking ${bookingNo}`, `${payload.customer.name} · ${vehicle.name}`, null, bookingId);
  }

  try {
    sendTemplate(
      "booking_submitted",
      normalizePhone(payload.customer.phone),
      { name: payload.customer.name, booking_no: bookingNo, vehicle: vehicle.name, pickup_at: payload.pickupAt },
      null,
      bookingId
    );
  } catch {
    // best-effort
  }

  // Sync booking & availability block to Supabase PostgreSQL
  import("./supabase").then(({ supabaseAdmin }) => {
    if (supabaseAdmin) {
      supabaseAdmin
        .from("bookings")
        .upsert(
          {
            id: bookingId,
            booking_no: bookingNo,
            enquiry_id: payload.enquiryId ?? null,
            customer_id: customerId,
            vehicle_id: vehicle.id,
            branch_id: vehicle.branch_id,
            pickup_at: payload.pickupAt,
            return_at: payload.returnAt,
            after_hours: quote.afterHours ? 1 : 0,
            status: "Pending verification",
            base_amount: quote.baseAmount,
            gst_amount: quote.gstAmount,
            deposit_amount: quote.depositAmount,
            other_fees_amount: otherFees,
            total_amount: quote.totalAmount,
            included_km: quote.includedKm,
            terms_version_id: terms?.id ?? null,
            notes: payload.notes ?? null,
          },
          { onConflict: "id" }
        )
        .then(() => {});

      supabaseAdmin
        .from("availability_blocks")
        .insert({
          vehicle_id: vehicle.id,
          starts_at: payload.pickupAt,
          ends_at: payload.returnAt,
          reason: "booked",
          booking_id: bookingId,
        })
        .then(() => {});
    }
  }).catch(() => {});

  return { bookingId, bookingNo, customerId };
}

export function acceptBookingTerms(bookingId: number, termsVersionId: number) {
  getDb()
    .prepare("UPDATE bookings SET terms_version_id = ?, terms_accepted_at = datetime('now') WHERE id = ?")
    .run(termsVersionId, bookingId);
}
