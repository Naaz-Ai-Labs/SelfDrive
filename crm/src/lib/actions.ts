"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { requireUser, requireAdmin, assertCan, assertAdmin } from "./auth";
import { logActivity, pushNotification } from "./activity";
import { nextNumber, slugify, normalizePhone } from "./utils";
import { sendTemplate } from "./messaging";
import { getSetting, setSetting } from "./settings";
import { calculateLateFee, calculateExtraKm } from "./pricing";
import type { SessionUser } from "./auth";

function refresh(path = "/dashboard") {
  revalidatePath(path, "layout");
}

export async function staffUser(): Promise<SessionUser> {
  return requireUser();
}

export async function adminUser(): Promise<SessionUser> {
  return requireAdmin();
}

/* -------------------------------- Enquiries -------------------------------- */

export async function createManualEnquiry(input: {
  name: string; phone: string; email?: string; categoryId?: number | null; vehicleId?: number | null;
  location?: string; pickupDate?: string; returnDate?: string; passengers?: number; source?: string; notes?: string;
}) {
  const user = await staffUser();
  const db = getDb();
  const phone = normalizePhone(input.phone);
  const enquiryNo = nextNumber("ENQ", null);
  const id = db
    .prepare(
      `INSERT INTO enquiries (enquiry_no, category_id, vehicle_id, pickup_date, return_date, location, passengers, name, phone, email, source, notes, assigned_to, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`
    )
    .run(
      enquiryNo, input.categoryId ?? null, input.vehicleId ?? null, input.pickupDate ?? null, input.returnDate ?? null,
      input.location ?? null, input.passengers ?? null, input.name, phone, input.email ?? null, input.source ?? "Manual", input.notes ?? null, user.id
    ).lastInsertRowid as number;
  logActivity(user.id, "enquiry_created", "enquiry", id, { enquiry_no: enquiryNo });
  refresh();
  return { id, enquiryNo };
}

export async function assignEnquiry(id: number, assigneeId: number | null) {
  const user = await staffUser();
  const db = getDb();
  db.prepare("UPDATE enquiries SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?").run(assigneeId, id);
  if (assigneeId) {
    const e = db.prepare("SELECT enquiry_no, name FROM enquiries WHERE id = ?").get(id) as { enquiry_no: string; name: string | null };
    pushNotification(assigneeId, `Enquiry ${e.enquiry_no} assigned`, e.name ?? "", id);
  }
  logActivity(user.id, "enquiry_assigned", "enquiry", id, { assignee_id: assigneeId });
  refresh();
  return { ok: true };
}

export async function changeEnquiryStage(id: number, stage: string) {
  const user = await staffUser();
  const db = getDb();
  const stages = getSetting<string[]>("enquiry_stages", []);
  if (!stages.includes(stage)) return { error: "Unknown stage" };
  db.prepare("UPDATE enquiries SET stage = ?, updated_at = datetime('now') WHERE id = ?").run(stage, id);
  db.prepare("INSERT INTO enquiry_history (enquiry_id, user_id, action, detail) VALUES (?, ?, 'stage_change', ?)").run(id, user.id, stage);
  logActivity(user.id, "enquiry_stage", "enquiry", id, { stage });
  refresh();
  return { ok: true };
}

export async function addEnquiryNote(id: number, note: string) {
  const user = await staffUser();
  const db = getDb();
  db.prepare("INSERT INTO enquiry_history (enquiry_id, user_id, action, detail) VALUES (?, ?, 'note', ?)").run(id, user.id, note);
  logActivity(user.id, "enquiry_note", "enquiry", id, { note });
  refresh();
  return { ok: true };
}

/* -------------------------------- Vehicles --------------------------------- */

export async function saveVehicle(input: {
  id?: number;
  name: string;
  brand: string;
  model: string;
  year?: number;
  categoryId?: number | null;
  branchId?: number | null;
  registrationNo?: string;
  cc?: number;
  fuelType?: string;
  transmission?: string;
  seats?: number;
  mileage?: string;
  includedKm?: number;
  extraKmRate?: number;
  rate12h?: number;
  rate24h?: number;
  hourlyRate?: number;
  deposit?: number;
  lateFeePerHour?: number;
  totalUnits?: number;
  description?: string;
  terms?: string;
  status?: string;
  active?: boolean;
  photoUrl?: string;
}) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  const slug = `${slugify(input.name)}-${input.id ?? Date.now().toString(36).slice(-4)}`;
  let vehicleId = input.id;
  const activeVal = input.active === false ? 0 : 1;
  const units = input.totalUnits ?? 1;

  if (vehicleId) {
    db.prepare(
      `UPDATE vehicles SET name=?, brand=?, model=?, year=?, category_id=?, branch_id=?, registration_no=?, cc=?, fuel_type=?, transmission=?, seats=?, mileage=?,
       included_km=?, extra_km_rate=?, rate_12h=?, rate_24h=?, hourly_rate=?, deposit=?, late_fee_per_hour=?, total_units=?, description=?, terms=?, status=?, active=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      input.name, input.brand, input.model, input.year ?? null, input.categoryId ?? null, input.branchId ?? null, input.registrationNo ?? null,
      input.cc ?? null, input.fuelType ?? "Petrol", input.transmission ?? "Manual", input.seats ?? 2, input.mileage ?? null,
      input.includedKm ?? 100, input.extraKmRate ?? 5, input.rate12h ?? 0, input.rate24h ?? 0, input.hourlyRate ?? 0, input.deposit ?? 0,
      input.lateFeePerHour ?? 0, units, input.description ?? null, input.terms ?? null, input.status ?? "available", activeVal, vehicleId
    );
    logActivity(user.id, "vehicle_updated", "vehicle", vehicleId, { name: input.name });
  } else {
    const result = db
      .prepare(
        `INSERT INTO vehicles (slug, name, brand, model, year, category_id, branch_id, registration_no, cc, fuel_type, transmission, seats, mileage,
         included_km, extra_km_rate, rate_12h, rate_24h, hourly_rate, deposit, late_fee_per_hour, total_units, description, terms, status, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        slug, input.name, input.brand, input.model, input.year ?? null, input.categoryId ?? null, input.branchId ?? null, input.registrationNo ?? null,
        input.cc ?? null, input.fuelType ?? "Petrol", input.transmission ?? "Manual", input.seats ?? 2, input.mileage ?? null,
        input.includedKm ?? 100, input.extraKmRate ?? 5, input.rate12h ?? 0, input.rate24h ?? 0, input.hourlyRate ?? 0, input.deposit ?? 0,
        input.lateFeePerHour ?? 0, units, input.description ?? null, input.terms ?? null, input.status ?? "available"
      );
    vehicleId = Number(result.lastInsertRowid);
    logActivity(user.id, "vehicle_created", "vehicle", vehicleId, { name: input.name });
  }

  if (input.photoUrl) {
    db.prepare("INSERT INTO vehicle_photos (vehicle_id, url, is_primary) VALUES (?, ?, 1)").run(vehicleId, input.photoUrl);
  }

  // Sync to Supabase PostgreSQL
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("vehicles").upsert(
        {
          id: vehicleId,
          slug,
          name: input.name,
          brand: input.brand,
          model: input.model,
          year: input.year ?? null,
          category_id: input.categoryId ?? null,
          branch_id: input.branchId ?? null,
          registration_no: input.registrationNo ?? null,
          cc: input.cc ?? null,
          fuel_type: input.fuelType ?? "Petrol",
          transmission: input.transmission ?? "Manual",
          seats: input.seats ?? 2,
          mileage: input.mileage ?? null,
          included_km: input.includedKm ?? 100,
          extra_km_rate: input.extraKmRate ?? 5,
          rate_12h: input.rate12h ?? 0,
          rate_24h: input.rate24h ?? 0,
          hourly_rate: input.hourlyRate ?? 0,
          deposit: input.deposit ?? 0,
          late_fee_per_hour: input.lateFeePerHour ?? 0,
          total_units: units,
          description: input.description ?? null,
          terms: input.terms ?? null,
          status: input.status ?? "available",
          active: activeVal,
        },
        { onConflict: "id" }
      );

      if (input.photoUrl) {
        await supabaseAdmin.from("vehicle_photos").insert({
          vehicle_id: vehicleId,
          url: input.photoUrl,
          is_primary: 1,
        });
      }
    } catch (err: any) {
      console.warn("Supabase vehicle sync warning:", err?.message || err);
    }
  }

  refresh("/");
  refresh();
  return { ok: true, id: vehicleId };
}

export async function deleteVehicle(id: number) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  db.prepare("UPDATE vehicles SET active = 0, status = 'archived' WHERE id = ?").run(id);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("vehicles").update({ active: 0, status: "archived" }).eq("id", id);
    } catch {}
  }

  logActivity(user.id, "vehicle_archived", "vehicle", id);
  refresh("/");
  refresh();
  return { ok: true };
}

export async function addVehiclePhoto(vehicleId: number, url: string, isPrimary = false) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  if (isPrimary) db.prepare("UPDATE vehicle_photos SET is_primary = 0 WHERE vehicle_id = ?").run(vehicleId);
  const res = db.prepare("INSERT INTO vehicle_photos (vehicle_id, url, is_primary) VALUES (?, ?, ?)").run(vehicleId, url, isPrimary ? 1 : 0);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("vehicle_photos").insert({
        id: Number(res.lastInsertRowid),
        vehicle_id: vehicleId,
        url,
        is_primary: isPrimary ? 1 : 0,
      });
    } catch {}
  }

  refresh("/");
  refresh();
  return { ok: true };
}

export async function removeVehiclePhoto(id: number) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  db.prepare("DELETE FROM vehicle_photos WHERE id = ?").run(id);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("vehicle_photos").delete().eq("id", id);
    } catch {}
  }

  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveVehicleCategory(input: { id?: number; name: string; kind: string; icon?: string; image?: string; shortDesc?: string; description?: string; active?: boolean; sort?: number }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  const slug = slugify(input.name);
  if (input.id) {
    db.prepare("UPDATE vehicle_categories SET name=?, kind=?, icon=?, image=?, short_desc=?, description=?, active=?, sort=? WHERE id=?").run(
      input.name, input.kind, input.icon ?? null, input.image ?? null, input.shortDesc ?? null, input.description ?? null, input.active === false ? 0 : 1, input.sort ?? 0, input.id
    );
  } else {
    db.prepare("INSERT INTO vehicle_categories (slug, name, kind, icon, image, short_desc, description, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      slug, input.name, input.kind, input.icon ?? null, input.image ?? null, input.shortDesc ?? null, input.description ?? null, input.sort ?? 0
    );
  }
  logActivity(user.id, "category_saved", "vehicle_category", input.id ?? null, { name: input.name });
  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveBranch(input: { id?: number; name: string; city?: string; address?: string; phone?: string; active?: boolean }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (input.id) {
    db.prepare("UPDATE branches SET name=?, city=?, address=?, phone=?, active=? WHERE id=?").run(input.name, input.city ?? null, input.address ?? null, input.phone ?? null, input.active === false ? 0 : 1, input.id);
  } else {
    db.prepare("INSERT INTO branches (name, city, address, phone) VALUES (?, ?, ?, ?)").run(input.name, input.city ?? null, input.address ?? null, input.phone ?? null);
  }
  refresh();
  return { ok: true };
}

/* ------------------------------ Pricing rules ------------------------------ */

export async function savePricingRule(input: {
  id?: number; name: string; vehicleId?: number | null; categoryId?: number | null; dayType: string; startDate: string; endDate: string;
  rate24h?: number | null; rate12h?: number | null; deposit?: number | null; includedKm?: number | null; extraKmRate?: number | null;
  minDays?: number; priority?: number; active?: boolean;
}) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (input.id) {
    db.prepare(
      `UPDATE pricing_rules SET name=?, vehicle_id=?, category_id=?, day_type=?, start_date=?, end_date=?, rate_24h=?, rate_12h=?, deposit=?, included_km=?, extra_km_rate=?, min_days=?, priority=?, active=?
       WHERE id=?`
    ).run(input.name, input.vehicleId ?? null, input.categoryId ?? null, input.dayType, input.startDate, input.endDate, input.rate24h ?? null, input.rate12h ?? null, input.deposit ?? null, input.includedKm ?? null, input.extraKmRate ?? null, input.minDays ?? 1, input.priority ?? 0, input.active === false ? 0 : 1, input.id);
  } else {
    db.prepare(
      `INSERT INTO pricing_rules (name, vehicle_id, category_id, day_type, start_date, end_date, rate_24h, rate_12h, deposit, included_km, extra_km_rate, min_days, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(input.name, input.vehicleId ?? null, input.categoryId ?? null, input.dayType, input.startDate, input.endDate, input.rate24h ?? null, input.rate12h ?? null, input.deposit ?? null, input.includedKm ?? null, input.extraKmRate ?? null, input.minDays ?? 1, input.priority ?? 0);
  }
  logActivity(user.id, "pricing_rule_saved", "pricing_rule", input.id ?? null, { name: input.name });
  refresh();
  return { ok: true };
}

export async function deletePricingRule(id: number) {
  const user = await staffUser();
  assertCan(user, "admin");
  getDb().prepare("DELETE FROM pricing_rules WHERE id = ?").run(id);
  refresh();
  return { ok: true };
}

/* -------------------------------- Bookings --------------------------------- */

export async function updateBookingStatus(id: number, status: string) {
  const user = await staffUser();
  const db = getDb();
  const prev = db.prepare("SELECT status FROM bookings WHERE id = ?").get(id) as { status: string };
  db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  db.prepare("INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, 'status_change', ?)").run(id, user.id, JSON.stringify({ from: prev.status, to: status }));
  logActivity(user.id, "booking_status", "booking", id, { from: prev.status, to: status });

  if (status === "Confirmed") {
    const b = db.prepare("SELECT booking_no, vehicle_id, pickup_at FROM bookings WHERE id = ?").get(id) as { booking_no: string; vehicle_id: number; pickup_at: string };
    const customer = db.prepare("SELECT c.name, c.phone FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE b.id = ?").get(id) as { name: string; phone: string } | undefined;
    const vehicle = db.prepare("SELECT name FROM vehicles WHERE id = ?").get(b.vehicle_id) as { name: string } | undefined;
    if (customer?.phone) {
      sendTemplate("booking_confirmation", customer.phone, { name: customer.name, booking_no: b.booking_no, vehicle: vehicle?.name ?? "", pickup_at: b.pickup_at }, null, id);
    }
  }
  refresh();
  return { ok: true };
}

export async function assignBookingManager(id: number, managerId: number | null) {
  const user = await staffUser();
  getDb().prepare("UPDATE bookings SET manager_id = ?, updated_at = datetime('now') WHERE id = ?").run(managerId, id);
  logActivity(user.id, "booking_assigned", "booking", id, { manager_id: managerId });
  refresh();
  return { ok: true };
}

export async function approveAfterHours(id: number, approve: boolean, note?: string) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  db.prepare("UPDATE bookings SET after_hours_approved_by = ?, notes = COALESCE(notes || char(10), '') || ? WHERE id = ?").run(
    approve ? user.id : null, `After-hours pickup ${approve ? "approved" : "declined"}${note ? `: ${note}` : ""}`, id
  );
  logActivity(user.id, "after_hours_decision", "booking", id, { approve, note });
  refresh();
  return { ok: true };
}

export async function addManualAdjustment(input: { bookingId: number; type: string; amount: number; reason: string }) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  db.prepare("INSERT INTO manual_adjustments (booking_id, type, amount, reason, employee_id, approved_by) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.bookingId, input.type, input.amount, input.reason, user.id, user.id
  );
  const field = input.type === "damage_charge" ? "damage_amount" : input.type.startsWith("late_fee") ? "late_fee_amount" : "other_fees_amount";
  db.prepare(`UPDATE bookings SET ${field} = ${field} + ?, total_amount = total_amount + ?, updated_at = datetime('now') WHERE id = ?`).run(input.amount, input.amount, input.bookingId);
  logActivity(user.id, "manual_adjustment", "booking", input.bookingId, input);
  refresh();
  return { ok: true };
}

/* ------------------------------- Inspections -------------------------------- */

export async function recordInspection(input: {
  bookingId: number; kind: "handover" | "return"; odometer?: number; fuelLevel?: string; notes?: string;
  photos: Array<{ side: string; url: string; notes?: string }>;
}) {
  const user = await staffUser();
  const db = getDb();
  const result = db.prepare("INSERT INTO inspections (booking_id, kind, employee_id, odometer, fuel_level, notes) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.bookingId, input.kind, user.id, input.odometer ?? null, input.fuelLevel ?? null, input.notes ?? null
  );
  const inspectionId = Number(result.lastInsertRowid);
  for (const p of input.photos) {
    db.prepare("INSERT INTO inspection_photos (inspection_id, side, url, notes) VALUES (?, ?, ?, ?)").run(inspectionId, p.side, p.url, p.notes ?? null);
  }

  if (input.kind === "handover") {
    db.prepare("UPDATE bookings SET status = 'Vehicle handed over', actual_pickup_at = datetime('now'), start_odometer = ?, updated_at = datetime('now') WHERE id = ?").run(input.odometer ?? null, input.bookingId);
    db.prepare("UPDATE vehicles SET status = 'booked' WHERE id = (SELECT vehicle_id FROM bookings WHERE id = ?)").run(input.bookingId);
  } else {
    const booking = db.prepare("SELECT vehicle_id, return_at, start_odometer, included_km FROM bookings WHERE id = ?").get(input.bookingId) as {
      vehicle_id: number; return_at: string; start_odometer: number | null; included_km: number;
    };
    const vehicle = db.prepare("SELECT extra_km_rate FROM vehicles WHERE id = ?").get(booking.vehicle_id) as { extra_km_rate: number };
    const now = new Date();
    const late = calculateLateFee(new Date(booking.return_at), now);
    const km = input.odometer != null && booking.start_odometer != null
      ? calculateExtraKm(booking.included_km, booking.start_odometer, input.odometer, vehicle.extra_km_rate)
      : { extraKm: 0, amount: 0 };
    db.prepare(
      `UPDATE bookings SET status = 'Inspection pending', actual_return_at = datetime('now'), end_odometer = ?,
       late_fee_amount = ?, extra_km_amount = ?, total_amount = total_amount + ? + ?, updated_at = datetime('now') WHERE id = ?`
    ).run(input.odometer ?? null, late.fee, km.amount, late.fee, km.amount, input.bookingId);
    db.prepare("UPDATE vehicles SET status = 'available' WHERE id = ?").run(booking.vehicle_id);
    db.prepare("INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, 'return_inspection', ?)").run(
      input.bookingId, user.id, JSON.stringify({ lateFee: late, extraKm: km })
    );
  }
  logActivity(user.id, `inspection_${input.kind}`, "booking", input.bookingId, { inspection_id: inspectionId });
  refresh();
  return { ok: true, inspectionId };
}

export async function addDamageReport(input: { bookingId: number; inspectionId?: number | null; description: string; chargeAmount: number }) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  db.prepare("INSERT INTO damage_reports (booking_id, inspection_id, description, charge_amount, approved_by) VALUES (?, ?, ?, ?, ?)").run(
    input.bookingId, input.inspectionId ?? null, input.description, input.chargeAmount, user.id
  );
  db.prepare("UPDATE bookings SET damage_amount = damage_amount + ?, total_amount = total_amount + ?, updated_at = datetime('now') WHERE id = ?").run(
    input.chargeAmount, input.chargeAmount, input.bookingId
  );
  logActivity(user.id, "damage_report", "booking", input.bookingId, input);
  refresh();
  return { ok: true };
}

/* --------------------------------- Payments --------------------------------- */

export async function addPayment(input: { bookingId: number; amount: number; kind?: string; method?: string; dueDate?: string; notes?: string }) {
  const user = await staffUser();
  const db = getDb();
  const booking = db.prepare("SELECT customer_id FROM bookings WHERE id = ?").get(input.bookingId) as { customer_id: number | null };
  const pn = nextNumber("PY", null);
  db.prepare(
    "INSERT INTO payments (payment_no, booking_id, customer_id, amount, kind, method, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)"
  ).run(pn, input.bookingId, booking.customer_id, input.amount, input.kind ?? "advance", input.method ?? null, input.dueDate ?? null, input.notes ?? null);
  logActivity(user.id, "payment_created", "booking", input.bookingId, { amount: input.amount });
  refresh();
  return { ok: true };
}

export async function markPaymentPaid(id: number, gatewayRef?: string) {
  const user = await staffUser();
  const db = getDb();
  const p = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as { payment_no: string; booking_id: number; customer_id: number | null; amount: number };
  const receiptNo = nextNumber("RC", null);
  db.prepare("UPDATE payments SET status = 'Paid', paid_at = datetime('now'), receipt_no = ?, gateway_ref = COALESCE(?, gateway_ref) WHERE id = ?").run(receiptNo, gatewayRef ?? null, id);
  db.prepare("UPDATE bookings SET paid_amount = paid_amount + ?, updated_at = datetime('now') WHERE id = ?").run(p.amount, p.booking_id);
  const customer = p.customer_id ? db.prepare("SELECT phone, name FROM customers WHERE id = ?").get(p.customer_id) as { phone: string | null; name: string } : null;
  if (customer?.phone) {
    sendTemplate("invoice_generated", customer.phone, { name: customer.name, amount: `₹${p.amount.toLocaleString("en-IN")}`, total: `₹${p.amount.toLocaleString("en-IN")}`, booking_no: p.payment_no }, null, p.booking_id);
  }
  logActivity(user.id, "payment_paid", "payment", id, { amount: p.amount, receipt: receiptNo });
  refresh();
  return { ok: true };
}

/* --------------------------------- Refunds ----------------------------------- */

export async function decideRefund(id: number, decision: "Approved" | "Rejected" | "Partially approved", approvedAmount?: number, notes?: string) {
  const user = await staffUser();
  assertCan(user, "manager");
  const db = getDb();
  db.prepare("UPDATE refunds SET status = ?, approved_amount = ?, admin_notes = ?, approved_at = datetime('now') WHERE id = ?").run(
    decision, approvedAmount ?? null, notes ?? null, id
  );
  logActivity(user.id, "refund_decision", "refund", id, { decision, approvedAmount });
  refresh();
  return { ok: true };
}

export async function completeRefund(id: number, method: string, transactionRef: string) {
  const user = await staffUser();
  assertCan(user, "finance");
  const db = getDb();
  db.prepare("UPDATE refunds SET status = 'Completed', method = ?, transaction_ref = ?, completed_at = datetime('now') WHERE id = ?").run(method, transactionRef, id);
  const r = db.prepare("SELECT booking_id, approved_amount, customer_id FROM refunds WHERE id = ?").get(id) as { booking_id: number; approved_amount: number | null; customer_id: number | null };
  const customer = r.customer_id ? db.prepare("SELECT phone, name FROM customers WHERE id = ?").get(r.customer_id) as { phone: string | null; name: string } : null;
  if (customer?.phone) {
    sendTemplate("refund_completed", customer.phone, { name: customer.name, amount: `₹${(r.approved_amount ?? 0).toLocaleString("en-IN")}`, transaction_ref: transactionRef, booking_no: String(r.booking_id) }, null, r.booking_id);
  }
  logActivity(user.id, "refund_completed", "refund", id, { method, transactionRef });
  refresh();
  return { ok: true };
}

/* ------------------------------ Problem tickets ------------------------------ */

export async function updateProblemTicket(id: number, patch: { status?: string; assignedTo?: number | null; replacementVehicleId?: number | null; resolutionNotes?: string }) {
  const user = await staffUser();
  const db = getDb();
  db.prepare(
    "UPDATE problem_tickets SET status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to), replacement_vehicle_id = COALESCE(?, replacement_vehicle_id), resolution_notes = COALESCE(?, resolution_notes), resolved_at = CASE WHEN ? = 'Resolved' THEN datetime('now') ELSE resolved_at END WHERE id = ?"
  ).run(patch.status ?? null, patch.assignedTo ?? null, patch.replacementVehicleId ?? null, patch.resolutionNotes ?? null, patch.status ?? null, id);
  logActivity(user.id, "problem_ticket_updated", "problem_ticket", id, patch);

  if (patch.status === "Resolved") {
    const row = db
      .prepare(
        `SELECT t.ticket_no, t.resolution_notes, c.name, c.phone, b.booking_no FROM problem_tickets t
         LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN bookings b ON b.id = t.booking_id WHERE t.id = ?`
      )
      .get(id) as { ticket_no: string; resolution_notes: string | null; name: string | null; phone: string | null; booking_no: string | null } | undefined;
    if (row?.phone) {
      try {
        sendTemplate("problem_ticket_resolved", row.phone, { name: row.name ?? "", ticket_no: row.ticket_no, booking_no: row.booking_no ?? "", notes: row.resolution_notes ?? "" }, null, null);
      } catch {
        // best-effort — ticket status is already updated regardless
      }
    }
  }

  refresh();
  return { ok: true };
}

/* -------------------------------- Settings ---------------------------------- */

export async function saveBusinessInfo(info: Record<string, unknown>) {
  const user = await staffUser();
  assertCan(user, "admin");
  setSetting("business", info);
  logActivity(user.id, "settings_updated", "settings", null, { key: "business" });
  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveSetting(key: string, value: unknown) {
  const user = await staffUser();
  assertCan(user, "admin");
  setSetting(key, value);
  logActivity(user.id, "settings_updated", "settings", null, { key });
  refresh();
  return { ok: true };
}

export async function saveTemplate(id: number | null, input: { key: string; name: string; channel: string; subject?: string; body: string; active?: boolean }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (id) {
    db.prepare("UPDATE message_templates SET name = ?, channel = ?, subject = ?, body = ?, active = ? WHERE id = ?").run(input.name, input.channel, input.subject ?? null, input.body, input.active ? 1 : 0, id);
  } else {
    db.prepare("INSERT INTO message_templates (key, name, channel, subject, body, active) VALUES (?, ?, ?, ?, ?, ?)").run(input.key, input.name, input.channel, input.subject ?? null, input.body, input.active ? 1 : 0);
  }
  logActivity(user.id, "template_saved", "settings", null, { key: input.key });
  refresh();
  return { ok: true };
}

export async function saveTestimonial(input: { id?: number; name: string; vehicle?: string; location?: string; rating?: number; quote: string; active?: boolean }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (input.id) {
    db.prepare("UPDATE testimonials SET name = ?, vehicle = ?, location = ?, rating = ?, quote = ?, active = ? WHERE id = ?").run(input.name, input.vehicle ?? null, input.location ?? null, input.rating ?? 5, input.quote, input.active ? 1 : 0, input.id);
  } else {
    db.prepare("INSERT INTO testimonials (name, vehicle, location, rating, quote, active) VALUES (?, ?, ?, ?, ?, 1)").run(input.name, input.vehicle ?? null, input.location ?? null, input.rating ?? 5, input.quote);
  }
  logActivity(user.id, "testimonial_saved", "settings", null, { name: input.name });
  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveUser(input: {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  role: string;
  branch?: string;
  password?: string;
  active?: boolean;
}) {
  const admin = await adminUser();
  const db = getDb();
  const { hashPassword } = await import("./auth");
  const { supabaseAdmin } = await import("./supabase");

  const emailClean = input.email.toLowerCase().trim();
  const isActive = input.active !== undefined ? (input.active ? 1 : 0) : 1;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  let targetId = input.id;
  let actionName = "created";
  let leftAt: string | null = null;

  if (targetId) {
    // Existing user
    const existing = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(targetId) as { is_active: number; left_at: string | null } | undefined;

    if (existing) {
      if (existing.is_active === 1 && isActive === 0) {
        // Staff deactivated / left org
        leftAt = now;
        actionName = "deactivated";
      } else if (existing.is_active === 0 && isActive === 1) {
        // Staff reactivated
        leftAt = null;
        actionName = "reactivated";
      } else {
        leftAt = existing.left_at ?? null;
        actionName = "updated";
      }
    }

    const passwordHash = input.password ? hashPassword(input.password) : null;

    if (passwordHash) {
      db.prepare(
        "UPDATE users SET name = ?, email = ?, phone = ?, role = ?, branch = ?, password_hash = ?, is_active = ?, left_at = ? WHERE id = ?"
      ).run(input.name, emailClean, input.phone ?? null, input.role, input.branch ?? null, passwordHash, isActive, leftAt, targetId);
    } else {
      db.prepare(
        "UPDATE users SET name = ?, email = ?, phone = ?, role = ?, branch = ?, is_active = ?, left_at = ? WHERE id = ?"
      ).run(input.name, emailClean, input.phone ?? null, input.role, input.branch ?? null, isActive, leftAt, targetId);
    }
  } else {
    // New staff user creation
    actionName = "created";
    const passwordHash = hashPassword(input.password ?? "StaffPass123!");
    const res = db
      .prepare(
        "INSERT INTO users (name, email, phone, password_hash, role, branch, is_active, left_at) VALUES (?, ?, ?, ?, ?, ?, 1, NULL)"
      )
      .run(input.name, emailClean, input.phone ?? null, passwordHash, input.role, input.branch ?? null);
    targetId = Number(res.lastInsertRowid);
  }

  // 1. Sync to Supabase PostgreSQL Database Table
  if (supabaseAdmin) {
    try {
      const passwordHash = input.password ? hashPassword(input.password) : undefined;
      await supabaseAdmin.from("users").upsert(
        {
          name: input.name,
          email: emailClean,
          phone: input.phone ?? null,
          role: input.role,
          branch: input.branch ?? null,
          is_active: isActive,
          left_at: leftAt,
          ...(passwordHash ? { password_hash: passwordHash } : {}),
        },
        { onConflict: "email" }
      );

      // 2. Sync to Supabase Auth
      if (input.password) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuth = list?.users.find((u) => u.email === emailClean);
        if (existingAuth) {
          await supabaseAdmin.auth.admin.updateUserById(existingAuth.id, {
            password: input.password,
            user_metadata: { name: input.name, role: input.role, branch: input.branch },
          });
        } else {
          await supabaseAdmin.auth.admin.createUser({
            email: emailClean,
            password: input.password,
            email_confirm: true,
            user_metadata: { name: input.name, role: input.role, branch: input.branch },
          });
        }
      }
    } catch (err: any) {
      console.error("Supabase staff sync warning:", err?.message || err);
    }
  }

  // 3. Log Audit Record in staff_history
  db.prepare(
    "INSERT INTO staff_history (staff_id, action, performed_by, detail) VALUES (?, ?, ?, ?)"
  ).run(
    targetId,
    actionName,
    admin.id,
    JSON.stringify({
      name: input.name,
      email: emailClean,
      role: input.role,
      is_active: isActive,
      left_at: leftAt,
      performed_by_name: admin.name,
    })
  );

  logActivity(admin.id, `staff_${actionName}`, "user", targetId, { email: emailClean, left_at: leftAt });
  refresh();
  return { ok: true, id: targetId };
}

/* --------------------------- Website content ------------------------------ */

export async function saveGalleryItem(input: { id?: number; title?: string; image: string; category?: string }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (input.id) {
    db.prepare("UPDATE gallery SET title = ?, image = ?, category = ? WHERE id = ?").run(input.title ?? null, input.image, input.category ?? null, input.id);
  } else {
    db.prepare("INSERT INTO gallery (title, image, category) VALUES (?, ?, ?)").run(input.title ?? null, input.image, input.category ?? null);
  }
  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveFaq(input: { id?: number; question: string; answer: string; active?: boolean }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  if (input.id) {
    db.prepare("UPDATE faqs SET question = ?, answer = ?, active = ? WHERE id = ?").run(input.question, input.answer, input.active ? 1 : 0, input.id);
  } else {
    db.prepare("INSERT INTO faqs (question, answer, active) VALUES (?, ?, 1)").run(input.question, input.answer);
  }
  refresh("/");
  refresh();
  return { ok: true };
}

export async function saveBlogPost(input: { id?: number; title: string; excerpt?: string; content: string; published?: boolean }) {
  const user = await staffUser();
  assertCan(user, "admin");
  const db = getDb();
  const slug = slugify(input.title);
  if (input.id) {
    db.prepare("UPDATE blog_posts SET title = ?, excerpt = ?, content = ?, published = ? WHERE id = ?").run(input.title, input.excerpt ?? null, input.content, input.published ? 1 : 0, input.id);
  } else {
    db.prepare("INSERT INTO blog_posts (slug, title, excerpt, content, published) VALUES (?, ?, ?, ?, 1)").run(slug, input.title, input.excerpt ?? null, input.content);
  }
  refresh("/");
  refresh();
  return { ok: true };
}

/* -------------------- Customer Document Verification --------------------- */

export async function verifyCustomerDocument(input: { documentId: number; approve: boolean; notes?: string }) {
  const staff = await staffUser();
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  const verifiedVal = input.approve ? 1 : 0;
  db.prepare(
    "UPDATE customer_documents SET verified = ?, verified_by = ? WHERE id = ?"
  ).run(verifiedVal, staff.id, input.documentId);

  const doc = db
    .prepare("SELECT * FROM customer_documents WHERE id = ?")
    .get(input.documentId) as { booking_id: number | null; kind: string; customer_id: number | null } | undefined;

  if (doc?.booking_id) {
    db.prepare(
      "INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, ?, ?)"
    ).run(
      doc.booking_id,
      staff.id,
      input.approve ? "document_verified" : "document_rejected",
      JSON.stringify({ kind: doc.kind, staff_name: staff.name, notes: input.notes })
    );
  }

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("customer_documents").update({
        verified: verifiedVal,
        verified_by: staff.id,
      }).eq("id", input.documentId);
    } catch {}
  }

  logActivity(staff.id, input.approve ? "doc_verified" : "doc_rejected", "customer_documents", input.documentId);
  refresh();
  return { ok: true };
}

export async function quickApproveBooking(input: { bookingId: number; approve: boolean; notes?: string }) {
  const staff = await staffUser();
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  const newStatus = input.approve ? "Confirmed" : "Cancelled";
  db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, input.bookingId);

  db.prepare(
    "INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, ?, ?)"
  ).run(
    input.bookingId,
    staff.id,
    input.approve ? "quick_approved" : "quick_rejected",
    JSON.stringify({ staff_name: staff.name, notes: input.notes ?? null, new_status: newStatus })
  );

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("bookings").update({ status: newStatus }).eq("id", input.bookingId);
    } catch {}
  }

  logActivity(staff.id, input.approve ? "booking_approved" : "booking_rejected", "booking", input.bookingId);
  refresh();
  return { ok: true };
}

export async function revertBookingDecision(bookingId: number) {
  const staff = await staffUser();
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  const restoredStatus = "Pending verification";
  db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(restoredStatus, bookingId);

  db.prepare(
    "INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, 'decision_reverted', ?)"
  ).run(
    bookingId,
    staff.id,
    JSON.stringify({ staff_name: staff.name, restored_status: restoredStatus })
  );

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("bookings").update({ status: restoredStatus }).eq("id", bookingId);
    } catch {}
  }

  logActivity(staff.id, "booking_decision_reverted", "booking", bookingId);
  refresh();
  return { ok: true };
}

export async function revertDocumentDecision(documentId: number) {
  const staff = await staffUser();
  const db = getDb();
  const { supabaseAdmin } = await import("./supabase");

  db.prepare("UPDATE customer_documents SET verified = 0, verified_by = NULL WHERE id = ?").run(documentId);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("customer_documents").update({ verified: 0, verified_by: null }).eq("id", documentId);
    } catch {}
  }

  logActivity(staff.id, "doc_decision_reverted", "customer_documents", documentId);
  refresh();
  return { ok: true };
}

