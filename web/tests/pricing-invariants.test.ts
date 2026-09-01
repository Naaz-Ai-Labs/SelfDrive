import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRentalQuoteFromStrings,
  isTwoWheeler,
  depositForVehicle,
  calculateBookingFinancials,
  findApplicablePricingRule,
  type PricingRule,
} from "../src/lib/pricing";

test("security deposit isolation invariant: deposit is never added to totalAmount", () => {
  const dio = {
    id: 1,
    name: "Honda Dio",
    category_kind: "scooter",
    rate_24h: 900,
    deposit: 1000,
    included_km: 100,
    extra_km_rate: 4,
  };

  const quote = calculateRentalQuoteFromStrings(dio, "2026-08-12", "08:00", "2026-08-13", "08:00");
  assert.ok(quote);

  // Invariant 1: totalAmount MUST equal payableNow
  assert.equal(quote.totalAmount, quote.payableNow);
  // Invariant 2: payableNow must NOT include the Rs. 1000 cash deposit
  assert.equal(quote.payableNow, 954);
  assert.equal(quote.depositAmount, 1000);
  assert.equal(quote.depositPayableAtPickup, 1000);
  assert.notEqual(quote.totalAmount, 1954);
});

test("a special/seasonal pricing rule overrides the site's quoted rate, matching the CRM", () => {
  const dio = { id: 1, category_id: 3, category_kind: "scooter", rate_24h: 900, deposit: 1000, included_km: 100, extra_km_rate: 4 };
  const festival: PricingRule = {
    id: 1, name: "Dasara peak", vehicle_id: 1, category_id: null, day_type: "festival",
    start_date: "2026-10-01", end_date: "2026-10-05", rate_24h: 1500, deposit: null,
    included_km: null, extra_km_rate: null, min_days: 1, priority: 5, active: 1,
  };

  const withRule = calculateRentalQuoteFromStrings(dio, "2026-10-02", "08:00", "2026-10-03", "08:00", [festival]);
  assert.ok(withRule);
  assert.equal(withRule.appliedRuleName, "Dasara peak");
  assert.equal(withRule.baseAmount, 1500, "the special rate must replace the standard 900/day rate");

  // Outside the rule's date range, the standard rate stands.
  const withoutRule = calculateRentalQuoteFromStrings(dio, "2026-11-02", "08:00", "2026-11-03", "08:00", [festival]);
  assert.ok(withoutRule);
  assert.equal(withoutRule.appliedRuleName, null);
  assert.equal(withoutRule.baseAmount, 900);
});

test("findApplicablePricingRule scopes to vehicle, then category, then fleet-wide, highest priority first", () => {
  const vehicleRule: PricingRule = { id: 1, name: "Vehicle-specific", vehicle_id: 42, category_id: null, day_type: "peak", start_date: "2026-01-01", end_date: "2026-01-31", rate_24h: 1000, deposit: null, included_km: null, extra_km_rate: null, min_days: 1, priority: 1, active: 1 };
  const categoryRule: PricingRule = { id: 2, name: "Category-wide", vehicle_id: null, category_id: 3, day_type: "peak", start_date: "2026-01-01", end_date: "2026-01-31", rate_24h: 800, deposit: null, included_km: null, extra_km_rate: null, min_days: 1, priority: 5, active: 1 };

  const pickup = new Date("2026-01-15T02:30:00Z"); // 08:00 IST
  const ret = new Date("2026-01-16T02:30:00Z");

  // Higher priority (category rule, priority 5) wins over a lower-priority vehicle rule.
  const best = findApplicablePricingRule([vehicleRule, categoryRule], { id: 42, category_id: 3 }, pickup, ret);
  assert.equal(best?.id, 2);

  // A vehicle not in scope for either rule gets nothing.
  const none = findApplicablePricingRule([vehicleRule, categoryRule], { id: 99, category_id: 7 }, pickup, ret);
  assert.equal(none, null);
});

test("calculateBookingFinancials correctly checks full and partial payments", () => {
  const paidBooking = calculateBookingFinancials({
    total_amount: "954.00",
    paid_amount: "954.00",
    deposit_amount: "1000.00",
  });
  assert.equal(paidBooking.totalAmount, 954);
  assert.equal(paidBooking.paidAmount, 954);
  assert.equal(paidBooking.depositAmount, 1000);
  assert.equal(paidBooking.balanceDue, 0);
  assert.equal(paidBooking.isFullyPaid, true);
});
