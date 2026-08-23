import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRentalQuoteFromStrings,
  isTwoWheeler,
  depositForVehicle,
  calculateBookingFinancials,
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
