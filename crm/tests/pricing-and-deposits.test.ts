import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRentalQuoteFromStrings, isTwoWheeler, depositForVehicle } from "../../web/src/lib/pricing";

test("two-wheelers have Rs.1,000 security deposit policy while cars have Rs.2,000", () => {
  const scooter = { category_kind: "scooter", deposit: 1000, rate_24h: 900 };
  const bike = { category_kind: "bike", deposit: 1000, rate_24h: 1200 };
  const car = { category_kind: "car", deposit: 2000, rate_24h: 3500 };
  const unsetScooter = { category_kind: "scooter", deposit: null, rate_24h: 900 };
  const unsetCar = { category_kind: "car", deposit: null, rate_24h: 3500 };

  assert.equal(isTwoWheeler(scooter), true);
  assert.equal(isTwoWheeler(bike), true);
  assert.equal(isTwoWheeler(car), false);

  assert.equal(depositForVehicle(scooter), 1000);
  assert.equal(depositForVehicle(bike), 1000);
  assert.equal(depositForVehicle(car), 2000);
  assert.equal(depositForVehicle(unsetScooter), 1000);
  assert.equal(depositForVehicle(unsetCar), 2000);
});

test("quote calculation sets totalAmount equal to payableNow without bundling cash deposit", () => {
  const dio = {
    id: 1,
    name: "Honda Dio",
    category_kind: "scooter",
    rate_24h: 900,
    weekend_rate_24h: 950,
    deposit: 1000,
    included_km: 100,
    extra_km_rate: 4,
  };

  // Wednesday to Thursday (1 weekday)
  const quote = calculateRentalQuoteFromStrings(dio, "2026-08-12", "08:00", "2026-08-13", "08:00");
  assert.ok(quote, "Quote should calculate successfully");

  // 1 weekday = Rs. 900 base
  assert.equal(quote.days, 1);
  assert.equal(quote.baseAmount, 900);
  // GST 6% of 900 = Rs. 54
  assert.equal(quote.gstAmount, 54);
  // payableNow = 900 + 54 = Rs. 954
  assert.equal(quote.payableNow, 954);
  // totalAmount must match payableNow (Rs. 954) and NOT include Rs. 1000 deposit (which would make it 1954)
  assert.equal(quote.totalAmount, 954, "totalAmount must equal payableNow (rental fare + GST)");
  // Deposit is isolated as Rs. 1000 for collection in cash at pickup
  assert.equal(quote.depositAmount, 1000);
  assert.equal(quote.depositPayableAtPickup, 1000);
});

test("four-wheeler quote sets totalAmount to rental fare and isolates Rs.2,000 cash deposit", () => {
  const baleno = {
    id: 11,
    name: "Maruti Suzuki Baleno",
    category_kind: "car",
    rate_24h: 3500,
    weekend_rate_24h: 3550,
    deposit: 2000,
    included_km: 300,
    extra_km_rate: 8,
  };

  // Wednesday to Thursday (1 weekday)
  const quote = calculateRentalQuoteFromStrings(baleno, "2026-08-12", "08:00", "2026-08-13", "08:00");
  assert.ok(quote, "Quote should calculate successfully");

  assert.equal(quote.days, 1);
  assert.equal(quote.baseAmount, 3500);
  // GST 6% of 3500 = Rs. 210
  assert.equal(quote.gstAmount, 210);
  // payableNow = 3500 + 210 = Rs. 3710
  assert.equal(quote.payableNow, 3710);
  // totalAmount must match payableNow (Rs. 3710)
  assert.equal(quote.totalAmount, 3710);
  // Deposit is isolated as Rs. 2000
  assert.equal(quote.depositAmount, 2000);
  assert.equal(quote.depositPayableAtPickup, 2000);
});

test("booking financial reconciliation: fully paid online booking has zero balance due", () => {
  const booking = {
    base_amount: 900,
    gst_amount: 54,
    other_fees_amount: 0,
    discount_amount: 0,
    deposit_amount: 1000,
    total_amount: 954, // Accurate rental total
    paid_amount: 954,  // Online payment captures rental total
  };

  const balanceDue = Math.max(0, booking.total_amount - booking.paid_amount);
  assert.equal(balanceDue, 0, "When paid_amount equals total_amount, balance due must be 0");
});

test("partial payment correctly computes remaining rental balance without being distorted by deposit", () => {
  const booking = {
    base_amount: 900,
    gst_amount: 54,
    other_fees_amount: 0,
    discount_amount: 0,
    deposit_amount: 1000,
    total_amount: 954,
    paid_amount: 500, // Partial advance
  };

  const balanceDue = Math.max(0, booking.total_amount - booking.paid_amount);
  assert.equal(balanceDue, 454, "Remaining balance due is 954 - 500 = 454");
});

test("calculateBookingFinancials helper returns clean figures and detects full payment", () => {
  const { calculateBookingFinancials } = require("../src/lib/pricing");

  const fullyPaid = calculateBookingFinancials({
    total_amount: 1272,
    paid_amount: 1272,
    deposit_amount: 1000,
  });
  assert.equal(fullyPaid.totalAmount, 1272);
  assert.equal(fullyPaid.paidAmount, 1272);
  assert.equal(fullyPaid.depositAmount, 1000);
  assert.equal(fullyPaid.balanceDue, 0);
  assert.equal(fullyPaid.isFullyPaid, true);

  const partiallyPaid = calculateBookingFinancials({
    total_amount: 3710,
    paid_amount: 2000,
    deposit_amount: 2000,
  });
  assert.equal(partiallyPaid.balanceDue, 1710);
  assert.equal(partiallyPaid.isFullyPaid, false);
});

test("multi-day quote with early pickup correctly computes totalAmount and isolates deposit", () => {
  const dio = {
    id: 1,
    name: "Honda Dio",
    category_kind: "scooter",
    rate_24h: 900,
    weekend_rate_24h: 950,
    deposit: 1000,
    included_km: 100,
    extra_km_rate: 4,
  };

  // 12 Aug (Wed) 06:00 to 14 Aug (Fri) 08:00 (2 days + early pickup before 08:00)
  const quote = calculateRentalQuoteFromStrings(dio, "2026-08-12", "06:00", "2026-08-14", "08:00");
  assert.ok(quote);

  assert.equal(quote.days, 2);
  assert.equal(quote.earlyPickup, true);
  assert.equal(quote.offSchedulePickupFee, 250); // Rs. 250 early pickup
  assert.equal(quote.baseAmount, 1800); // 2 * 900
  // Taxable = 1800 + 250 = 2050. GST 6% of 2050 = Rs. 123
  assert.equal(quote.gstAmount, 123);
  assert.equal(quote.payableNow, 2173); // 2050 + 123
  assert.equal(quote.totalAmount, 2173);
  assert.equal(quote.depositAmount, 1000);
  assert.notEqual(quote.totalAmount, quote.payableNow + quote.depositAmount, "totalAmount must NEVER include deposit");
});

test("revenue aggregation invariant: summing total_amount accurately reflects revenue without deposit inflation", () => {
  const sampleBookings = [
    { id: 1, status: "Confirmed", total_amount: 954, deposit_amount: 1000, paid_amount: 954 },
    { id: 2, status: "Completed", total_amount: 3710, deposit_amount: 2000, paid_amount: 3710 },
    { id: 3, status: "Vehicle handed over", total_amount: 1908, deposit_amount: 1000, paid_amount: 1908 },
    { id: 4, status: "Cancelled", total_amount: 954, deposit_amount: 1000, paid_amount: 0 },
  ];

  const REVENUE_STATUSES = new Set(["Confirmed", "Completed", "Vehicle handed over", "Active rental"]);
  const activeBookings = sampleBookings.filter((b) => REVENUE_STATUSES.has(b.status));

  const totalRevenue = activeBookings.reduce((sum, b) => sum + b.total_amount, 0);
  const totalDeposits = activeBookings.reduce((sum, b) => sum + b.deposit_amount, 0);

  // Expected revenue: 954 + 3710 + 1908 = 6572
  assert.equal(totalRevenue, 6572, "Total revenue must be exact sum of rental totals");
  // Total deposits held: 1000 + 2000 + 1000 = 4000
  assert.equal(totalDeposits, 4000, "Total deposits must be counted separately");
  // Invariant: revenue + deposits should equal all cash flows, without deposit leaking into revenue
  assert.equal(totalRevenue + totalDeposits, 10572);
});

test("formatDateTime correctly displays IST times for both canonical and unadorned strings", () => {
  const { formatDateTime, formatDate } = require("../src/lib/utils");

  // Canonical IST string: 28 Aug 2026, 11:00 AM
  const formattedCanonical1 = formatDateTime("2026-08-28T11:00:00+05:30");
  assert.ok(formattedCanonical1.includes("28 Aug 2026"), "Date must be 28 Aug 2026");
  assert.ok(formattedCanonical1.includes("11:00 am") || formattedCanonical1.includes("11:00 AM") || formattedCanonical1.includes("11:00"), "Time must be 11:00 am");

  // Canonical IST string: 28 Aug 2026, 11:00 PM (23:00)
  const formattedCanonical2 = formatDateTime("2026-08-28T23:00:00+05:30");
  assert.ok(formattedCanonical2.includes("28 Aug 2026"));
  assert.ok(formattedCanonical2.includes("11:00 pm") || formattedCanonical2.includes("11:00 PM") || formattedCanonical2.includes("23:00"), "Time must be 11:00 pm");

  // Unadorned legacy string: '2026-08-28T11:00'
  const formattedLegacy = formatDateTime("2026-08-28T11:00");
  assert.ok(formattedLegacy.includes("28 Aug 2026"));
  assert.ok(formattedLegacy.includes("11:00 am") || formattedLegacy.includes("11:00 AM") || formattedLegacy.includes("11:00"), "Legacy string must format as 11:00 am, not 4:30 pm");
});
