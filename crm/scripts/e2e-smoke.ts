/* E2E smoke test: drives real lib code for the rental booking flow.
   Run with: npx tsx scripts/e2e-smoke.ts (from project root) */

import { getDb } from "../src/lib/db";
import { saveBookingDraft, submitBooking, getDraft } from "../src/lib/booking-actions";
import { renderTemplate, sendTemplate, templateByKey } from "../src/lib/messaging";
import { findCustomerByTarget, createCustomerSession, getCustomerSession, hashOtp } from "../src/lib/portal-session";
import { calculateLateFee, calculateExtraKm } from "../src/lib/pricing";

const db = getDb();
let failures = 0;

function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE active = 1 ORDER BY id LIMIT 1").get() as { id: number; name: string };
  check("seed vehicle exists", !!vehicle);

  // ---- 1. Customer booking journey (real code path) ----
  const phone = "+91 98765 10001";
  const pickupAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
  const returnAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16);

  const token = (await saveBookingDraft({
    categoryId: null, vehicleId: vehicle.id, pickupAt, returnAt, location: "Sakleshpura branch", passengers: 2, step: 3,
    contact: { name: "Ramesh Kumar", phone, email: "ramesh.kumar@example.com" },
  })).token;
  check("draft token format", /^[a-f0-9]{32,64}$/.test(token), token.slice(0, 10));

  const draft = await getDraft(token);
  check("draft roundtrip", draft !== null && draft.contact.name === "Ramesh Kumar");

  const res = await submitBooking({
    token, vehicleId: vehicle.id, pickupAt, returnAt, location: "Sakleshpura branch", passengers: 2,
    contact: { name: "Ramesh Kumar", phone, email: "ramesh.kumar@example.com" }, termsAccepted: true,
  });
  check("submit booking", res.ok === true, `bookingNo=${res.bookingNo}`);

  const booking = db.prepare("SELECT * FROM bookings WHERE booking_no = ?").get(res.bookingNo!) as Record<string, unknown>;
  check("booking created", !!booking, booking ? `status=${String(booking.status)}` : "");
  check("booking status is Pending verification", String(booking.status) === "Pending verification");
  check("availability block created", (db.prepare("SELECT COUNT(*) c FROM availability_blocks WHERE booking_id = ?").get(Number(booking.id)) as { c: number }).c === 1);

  const enq = db.prepare("SELECT * FROM enquiries WHERE draft_token = ?").get(token) as Record<string, unknown> | undefined;
  check("draft token cleared after submit", enq === undefined);

  const msg = db.prepare("SELECT * FROM messages WHERE booking_id = ? ORDER BY id DESC LIMIT 1").get(Number(booking.id)) as Record<string, unknown>;
  check("confirmation message logged", !!msg, msg ? `channel=${String(msg.channel)}` : "");

  // ---- 2. Double-booking prevention ----
  const clash = await submitBooking({
    token: "", vehicleId: vehicle.id, pickupAt, returnAt, contact: { name: "Someone Else", phone: "+91 98765 20002" }, termsAccepted: true,
  });
  check("double booking rejected", clash.ok === false, clash.error);

  // ---- 3. Template rendering ----
  const rendered = renderTemplate("Hi {name}, your booking {booking_no} for {vehicle} totals {total}.", {
    name: "Ramesh", booking_no: res.bookingNo, vehicle: vehicle.name, total: "₹3,675",
  });
  check("template placeholders", rendered.includes("Ramesh") && rendered.includes("₹3,675") && !rendered.includes("{name}"));
  check("booking_confirmation template exists", !!templateByKey("booking_confirmation"));

  // ---- 4. Customer OTP session ----
  const cust = findCustomerByTarget(phone);
  check("customer found by phone", !!cust, cust ? `id=${cust.id}` : "");
  const ctoken = createCustomerSession(cust?.id ?? null, phone);
  const cses = getCustomerSession(ctoken);
  check("customer session works", !!cses && cses.target === phone);
  const otpHash = hashOtp("123456");
  check("otp hash stable", hashOtp("123456") === otpHash);

  // ---- 5. Pricing engine ----
  const late = calculateLateFee(new Date("2026-01-01T08:00:00"), new Date("2026-01-01T09:15:00"));
  check("late fee calculated for 75 min overdue", late.fee > 0, `fee=${late.fee}`);
  const km = calculateExtraKm(100, 1000, 1150, 8);
  check("extra km calculated", km.extraKm === 50 && km.amount === 400);

  console.log("\n(Handover/return/payment actions require an authenticated staff session — verified via typecheck + admin UI, not this script.)");

  console.log(`\n=== ${failures === 0 ? "ALL E2E CHECKS PASSED" : failures + " FAILURE(S)"} ===`);
  console.log(`IDs: vehicle=${vehicle.id} booking=${booking ? Number(booking.id) : "-"} customer=${cust?.id ?? "-"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
