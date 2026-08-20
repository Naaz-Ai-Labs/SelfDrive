/**
 * Rental-day counting.
 *
 * These encode the owner's stated rules directly:
 *   - the rental day runs 08:00 -> 08:00 IST
 *   - 12 Aug 08:00 -> 13 Aug 08:00 is exactly ONE day
 *   - pickup before 08:00 is a one-off surcharge, NOT an extra day
 *   - drop after 08:00 adds ONE WHOLE extra day (strict, no grace)
 *
 * Everything here is timezone-sensitive, and this ran wrong in production once
 * already: the booking form used the runtime's local clock, so Vercel (UTC) and the
 * browser (IST) disagreed by 5.5 hours. The IST cases below are the regression.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRentalDays, istDate, isWeekendIst, istDateKey } from "../src/lib/rental-clock";

/** 12 Aug 2026 is a Wednesday. Month is 0-indexed. */
const AUG = 7;

test("08:00 to 08:00 next day is exactly one day", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 12, 8),
    returnAt: istDate(2026, AUG, 13, 8),
  });
  assert.equal(r.days, 1);
  assert.equal(r.earlyPickup, false);
  assert.equal(r.lateDrop, false);
});

test("early pickup does not buy an extra day, only flags the surcharge", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 12, 6),
    returnAt: istDate(2026, AUG, 13, 8),
  });
  assert.equal(r.days, 1, "picking up early must not add a charged day");
  assert.equal(r.earlyPickup, true);
});

test("dropping after 08:00 adds one whole day", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 12, 8),
    returnAt: istDate(2026, AUG, 13, 9),
  });
  assert.equal(r.days, 2, "a 09:00 drop is a full extra day, not an hourly fee");
  assert.equal(r.lateDrop, true);
});

test("08:01 is already late — the boundary is strict, no grace period", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 12, 8),
    returnAt: istDate(2026, AUG, 13, 8, 1),
  });
  assert.equal(r.days, 2);
  assert.equal(r.lateDrop, true);
});

test("same-day booking costs one day, never zero", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 12, 8),
    returnAt: istDate(2026, AUG, 12, 18),
  });
  assert.equal(r.days, 1);
});

test("multi-day booking counts every day", () => {
  // 10 Aug 2026 is Monday, 13 Aug 2026 is Thursday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 10, 8),
    returnAt: istDate(2026, AUG, 13, 8),
  });
  assert.equal(r.days, 3);
  assert.equal(r.dayDates.length, 3);
});

test("Friday pickup to Monday drop is three days", () => {
  // 14 Aug 2026 is a Friday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 17, 8),
  });
  assert.equal(r.days, 3);
});

test("Friday pickup to Sunday drop is two days", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 16, 8),
  });
  assert.equal(r.days, 2);
});

test("charged days are exposed per-day so weekday and weekend can price differently", () => {
  // Fri 14 -> Mon 17: Friday (weekday), Saturday, Sunday (both weekend).
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 17, 8),
  });
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, true, true]);
});

test("month boundary rolls over correctly", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 31, 8),
    returnAt: istDate(2026, 8, 2, 8), // 2 Sep
  });
  assert.equal(r.days, 2);
  assert.equal(istDateKey(r.dayDates[1]), "2026-09-01");
});

test("year boundary rolls over correctly (Saturday drop-off locks through Sunday)", () => {
  // 31 Dec 2026 is Thursday, 2 Jan 2027 is Saturday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, 11, 31, 8), // 31 Dec
    returnAt: istDate(2027, 0, 2, 9), // 2 Jan (Saturday), late drop
  });
  assert.equal(r.days, 4, "Saturday drop-off locks full weekend (Thu + Fri + Sat + Sun = 4 days)");
  assert.equal(istDateKey(r.dayDates[0]), "2026-12-31");
  assert.equal(istDateKey(r.dayDates[1]), "2027-01-01");
  assert.equal(istDateKey(r.dayDates[2]), "2027-01-02");
  assert.equal(istDateKey(r.dayDates[3]), "2027-01-03");
});

test("IST is used regardless of the runtime timezone", () => {
  // 02:00 UTC on 13 Aug is 07:30 IST the same day — before the 08:00 boundary.
  // Reading this in UTC would place it on the wrong side of the rental-day line.
  const utcInstant = new Date("2026-08-13T02:00:00.000Z");
  assert.equal(istDateKey(utcInstant), "2026-08-13");

  // 20:00 UTC on 12 Aug is 01:30 IST on 13 Aug — a different calendar day in IST.
  const lateUtc = new Date("2026-08-12T20:00:00.000Z");
  assert.equal(istDateKey(lateUtc), "2026-08-13");
});

test("Saturday and Sunday are the weekend, Monday to Friday are not", () => {
  assert.equal(isWeekendIst(istDate(2026, AUG, 15, 12)), true, "Saturday");
  assert.equal(isWeekendIst(istDate(2026, AUG, 16, 12)), true, "Sunday");
  assert.equal(isWeekendIst(istDate(2026, AUG, 17, 12)), false, "Monday");
  assert.equal(isWeekendIst(istDate(2026, AUG, 14, 12)), false, "Friday");
});

test("Saturday pickup with same-day Saturday return charges for Saturday + Sunday (2 days)", () => {
  // 15 Aug 2026 is a Saturday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 15, 20),
  });
  assert.equal(r.days, 2, "Saturday pickup must charge for full weekend package (Sat + Sun)");
  assert.equal(r.dayDates.length, 2);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-15");
  assert.equal(istDateKey(r.dayDates[1]), "2026-08-16");
  assert.deepEqual(r.dayDates.map(isWeekendIst), [true, true]);
});

test("Saturday pickup to Sunday morning return charges for Saturday + Sunday (2 days)", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 16, 8),
  });
  assert.equal(r.days, 2);
  assert.equal(r.dayDates.length, 2);
});

test("Saturday pickup to Monday morning return charges for Saturday + Sunday (2 days)", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 17, 8),
  });
  assert.equal(r.days, 2);
  assert.equal(r.dayDates.length, 2);
});

test("Friday pickup to Saturday drop-off charges for Friday + Saturday + Sunday (3 days)", () => {
  // 14 Aug 2026 is a Friday, 15 Aug 2026 is a Saturday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 15, 8),
  });
  assert.equal(r.days, 3, "Friday pickup with Saturday drop-off must charge through Sunday (Fri + Sat + Sun)");
  assert.equal(r.dayDates.length, 3);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-14");
  assert.equal(istDateKey(r.dayDates[1]), "2026-08-15");
  assert.equal(istDateKey(r.dayDates[2]), "2026-08-16");
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, true, true]);
});

test("Friday pickup (afternoon) to Saturday afternoon drop-off charges for Friday + Saturday + Sunday (3 days)", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 12),
    returnAt: istDate(2026, AUG, 15, 13),
  });
  assert.equal(r.days, 3);
  assert.equal(r.dayDates.length, 3);
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, true, true]);
});

test("Thursday pickup to Saturday drop-off charges for Thu + Fri + Sat + Sun (4 days)", () => {
  // 13 Aug 2026 is a Thursday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 13, 8),
    returnAt: istDate(2026, AUG, 15, 8),
  });
  assert.equal(r.days, 4, "Thursday pickup with Saturday drop-off must charge through Sunday (4 days)");
  assert.equal(r.dayDates.length, 4);
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, false, true, true]);
});

test("an invalid date is rejected rather than silently counted", () => {
  assert.throws(() =>
    computeRentalDays({ pickupAt: new Date("nonsense"), returnAt: istDate(2026, AUG, 13, 8) })
  );
});
