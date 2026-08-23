import { test } from "node:test";
import assert from "node:assert/strict";

// Import modules to test
import {
  computeRentalDays,
  parseIstInstant,
  toCanonicalIstIso,
  istParts,
  isWeekendIst,
  istDate,
  istDateKey,
} from "../src/lib/rental-clock";

import {
  calculateRentalQuoteFromStrings,
  calculateLateFee,
  calculateBookingFinancials,
  isTwoWheeler,
  depositForVehicle,
} from "../../web/src/lib/pricing";

import { formatDateTime, formatDate, formatINR } from "../src/lib/utils";

// Mock vehicle catalog
const DIO_SCOOTER = {
  id: 1,
  name: "Honda Dio",
  category_kind: "scooter",
  rate_24h: 900,
  weekend_rate_24h: 950,
  deposit: 1000,
  included_km: 100,
  extra_km_rate: 4,
};

const BALENO_CAR = {
  id: 11,
  name: "Maruti Suzuki Baleno",
  category_kind: "car",
  rate_24h: 3500,
  weekend_rate_24h: 3550,
  deposit: 2000,
  included_km: 300,
  extra_km_rate: 8,
};

// ==========================================
// 1. TIMEZONE & DATE PARSING LOGIC
// ==========================================

test("Logic Check 1: Timezone parsing invariant across all format variations", () => {
  // Test variations of 28 Aug 2026 at 11:00 AM IST
  const variations11AM = [
    "2026-08-28T11:00:00+05:30",
    "2026-08-28T05:30:00.000Z",
    "2026-08-28T11:00",
    "2026-08-28 11:00",
    "28-08-2026 11:00",
  ];

  for (const str of variations11AM) {
    const instant = parseIstInstant(str);
    assert.ok(instant, `Should parse ${str}`);
    const parts = istParts(instant);
    assert.equal(parts.year, 2026, `Year for ${str}`);
    assert.equal(parts.month, 7, `Month for ${str}`); // 7 = August (0-indexed)
    assert.equal(parts.day, 28, `Day for ${str}`);
    assert.equal(parts.hour, 11, `Hour for ${str} must be 11 AM`);
    assert.equal(parts.minute, 0, `Minute for ${str}`);
    assert.equal(toCanonicalIstIso(str), "2026-08-28T11:00:00+05:30");
  }

  // Test variations of 28 Aug 2026 at 11:00 PM (23:00) IST
  const variations11PM = [
    "2026-08-28T23:00:00+05:30",
    "2026-08-28T17:30:00.000Z",
    "2026-08-28T23:00",
    "2026-08-28 23:00",
    "28-08-2026 23:00",
  ];

  for (const str of variations11PM) {
    const instant = parseIstInstant(str);
    assert.ok(instant, `Should parse ${str}`);
    const parts = istParts(instant);
    assert.equal(parts.year, 2026, `Year for ${str}`);
    assert.equal(parts.month, 7, `Month for ${str}`);
    assert.equal(parts.day, 28, `Day for ${str}`);
    assert.equal(parts.hour, 23, `Hour for ${str} must be 11 PM (23:00)`);
    assert.equal(parts.minute, 0, `Minute for ${str}`);
    assert.equal(toCanonicalIstIso(str), "2026-08-28T23:00:00+05:30");
  }
});

// ==========================================
// 2. RENTAL-CLOCK & PRICING RULES LOGIC
// ==========================================

test("Logic Check 2: Single-day standard rental (Wed 08:00 -> Thu 08:00)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-12", "08:00", "2026-08-13", "08:00");
  assert.ok(quote);
  assert.equal(quote.days, 1);
  assert.equal(quote.baseAmount, 900); // 1 weekday @ 900
  assert.equal(quote.gstAmount, 54); // 6% GST
  assert.equal(quote.payableNow, 954);
  assert.equal(quote.totalAmount, 954);
  assert.equal(quote.depositAmount, 1000);
});

test("Logic Check 3: Same-day weekday rental (Wed 11:00 AM -> Wed 11:00 PM)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-12", "11:00", "2026-08-12", "23:00");
  assert.ok(quote);
  assert.equal(quote.days, 1);
  assert.equal(quote.baseAmount, 900);
  assert.equal(quote.gstAmount, 54);
  assert.equal(quote.payableNow, 954);
  assert.equal(quote.totalAmount, 954);
});

test("Logic Check 4: Same-day Friday rental (Fri 11:00 AM -> Fri 11:00 PM)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-28", "11:00", "2026-08-28", "23:00");
  assert.ok(quote);
  assert.equal(quote.days, 1, "Must be 1 day (not 3 days)");
  assert.equal(quote.baseAmount, 900, "Weekday rate applies on Friday");
  assert.equal(quote.gstAmount, 54);
  assert.equal(quote.payableNow, 954);
  assert.equal(quote.totalAmount, 954);
});

test("Logic Check 5: Friday pickup with Saturday return (Fri 08:00 -> Sat 08:00)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-28", "08:00", "2026-08-29", "08:00");
  assert.ok(quote);
  assert.equal(quote.days, 3, "Friday to Saturday drops require full weekend lock (Fri + Sat + Sun = 3 days)");
  // 1 weekday (900) + 2 weekend days (2 * 950 = 1900) = 2800
  assert.equal(quote.baseAmount, 2800);
  assert.equal(quote.gstAmount, 168); // 6% of 2800
  assert.equal(quote.payableNow, 2968);
  assert.equal(quote.totalAmount, 2968);
  assert.equal(quote.depositAmount, 1000);
});

test("Logic Check 6: Saturday pickup (Sat 08:00 -> Sun 08:00)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-29", "08:00", "2026-08-30", "08:00");
  assert.ok(quote);
  assert.equal(quote.days, 2, "Saturday pickup requires 2 days minimum (Sat + Sun)");
  // 2 weekend days = 2 * 950 = 1900
  assert.equal(quote.baseAmount, 1900);
  assert.equal(quote.gstAmount, 114); // 6% of 1900
  assert.equal(quote.payableNow, 2014);
  assert.equal(quote.totalAmount, 2014);
});

test("Logic Check 7: Early pickup surcharge (Wed 06:00 -> Thu 08:00)", () => {
  const quote = calculateRentalQuoteFromStrings(DIO_SCOOTER, "2026-08-12", "06:00", "2026-08-13", "08:00");
  assert.ok(quote);
  assert.equal(quote.days, 1);
  assert.equal(quote.earlyPickup, true);
  assert.equal(quote.offSchedulePickupFee, 250);
  assert.equal(quote.baseAmount, 900);
  // Taxable: 900 + 250 = 1150. GST 6%: 69
  assert.equal(quote.gstAmount, 69);
  assert.equal(quote.payableNow, 1219);
  assert.equal(quote.totalAmount, 1219);
});

// ==========================================
// 3. FINANCIAL RECONCILIATION & BALANCE LOGIC
// ==========================================

test("Logic Check 8: calculateBookingFinancials accurately computes balance and full payment status", () => {
  // Case A: 1-day Dio fully paid online
  const b1 = calculateBookingFinancials({
    total_amount: 954,
    paid_amount: 954,
    deposit_amount: 1000,
  });
  assert.equal(b1.totalAmount, 954);
  assert.equal(b1.paidAmount, 954);
  assert.equal(b1.depositAmount, 1000);
  assert.equal(b1.balanceDue, 0);
  assert.equal(b1.isFullyPaid, true);

  // Case B: 3-day weekend booking partially paid
  const b2 = calculateBookingFinancials({
    total_amount: 2968,
    paid_amount: 954,
    deposit_amount: 1000,
  });
  assert.equal(b2.totalAmount, 2968);
  assert.equal(b2.paidAmount, 954);
  assert.equal(b2.depositAmount, 1000);
  assert.equal(b2.balanceDue, 2014);
  assert.equal(b2.isFullyPaid, false);

  // Case C: Car booking fully paid
  const b3 = calculateBookingFinancials({
    total_amount: 3710,
    paid_amount: 3710,
    deposit_amount: 2000,
  });
  assert.equal(b3.totalAmount, 3710);
  assert.equal(b3.paidAmount, 3710);
  assert.equal(b3.depositAmount, 2000);
  assert.equal(b3.balanceDue, 0);
  assert.equal(b3.isFullyPaid, true);
});

// ==========================================
// 4. LATE RETURN FEE & EXTRA KM LOGIC
// ==========================================

test("Logic Check 9: Late fee calculation bills full additional day for overdue returns", () => {
  const scheduled = istDate(2026, 7, 28, 8, 0); // 28 Aug 08:00 AM

  // On time
  const onTime = calculateLateFee(scheduled, istDate(2026, 7, 28, 8, 0), 900);
  assert.equal(onTime.fee, 0);

  // 5 minutes late -> 1 full day fee
  const fiveMinLate = calculateLateFee(scheduled, istDate(2026, 7, 28, 8, 5), 900);
  assert.equal(fiveMinLate.minutesLate, 5);
  assert.equal(fiveMinLate.fee, 900, "Even 5 minutes late bills full 1-day rate");

  // 25 hours late -> 2 full days fee
  const twentyFiveHoursLate = calculateLateFee(scheduled, istDate(2026, 7, 29, 9, 0), 900);
  assert.equal(twentyFiveHoursLate.minutesLate, 25 * 60);
  assert.equal(twentyFiveHoursLate.fee, 1800, "25 hours late bills 2 full days");
});

// ==========================================
// 5. DISPLAY & FORMATTING LOGIC
// ==========================================

test("Logic Check 10: Formatters output clean, accurate representations in INR and IST", () => {
  assert.equal(formatINR(954), "₹954");
  assert.equal(formatINR(2968), "₹2,968");
  assert.equal(formatINR(0), "₹0");

  const dt1 = formatDateTime("2026-08-28T11:00:00+05:30");
  assert.ok(dt1.includes("28 Aug 2026"));
  assert.ok(dt1.includes("11:00"));

  const dt2 = formatDateTime("2026-08-28T23:00:00+05:30");
  assert.ok(dt2.includes("28 Aug 2026"));
  assert.ok(dt2.includes("11:00 pm") || dt2.includes("11:00 PM") || dt2.includes("23:00"));
});
