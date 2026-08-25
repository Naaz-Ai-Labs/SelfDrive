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

test("year boundary rolls over correctly (31 Dec to 2 Jan)", () => {
  // 31 Dec 2026 is Thursday, 2 Jan 2027 is Saturday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, 11, 31, 8), // 31 Dec (Thursday)
    returnAt: istDate(2027, 0, 2, 9), // 2 Jan (Saturday), late drop
  });
  assert.equal(r.days, 4, "31 Dec to 2 Jan (Saturday drop) takes 2 weekdays + 2 weekend days = 4 days");
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

test("Saturday pickup with same-day Saturday return charges for 2 weekend days", () => {
  // 15 Aug 2026 is a Saturday.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 15, 20),
  });
  assert.equal(r.days, 2, "Saturday same-day rental takes 2 weekend days");
  assert.equal(r.dayDates.length, 2);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-15");
  assert.equal(istDateKey(r.dayDates[1]), "2026-08-16");
  assert.deepEqual(r.dayDates.map(isWeekendIst), [true, true]);
});

test("Saturday pickup to Sunday morning return charges for 2 weekend days", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 16, 8),
  });
  assert.equal(r.days, 2, "Sat 08:00 to Sun 08:00 takes 2 weekend days (Sat + Sun)");
  assert.equal(r.dayDates.length, 2);
});

test("Saturday pickup to Monday morning return charges for 2 days", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 15, 8),
    returnAt: istDate(2026, AUG, 17, 8),
  });
  assert.equal(r.days, 2, "Sat 08:00 to Mon 08:00 is 2 days");
  assert.equal(r.dayDates.length, 2);
});

test("Friday pickup to Saturday drop-off ON TIME (08:00) charges 1 day — no weekend padding on an on-time drop", () => {
  // 14 Aug 2026 is a Friday, 15 Aug 2026 is a Saturday. Return AT 08:00 is on time, not late.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 15, 8),
  });
  assert.equal(r.lateDrop, false);
  assert.equal(r.days, 1, "on-time Fri->Sat drop is exactly the 1 Friday rental day, no weekend surcharge");
  assert.equal(r.dayDates.length, 1);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-14");
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false]);
});

test("Friday pickup to Saturday drop-off LATE (09:00) charges 3 days (1 weekday + 2 weekend days)", () => {
  // Same dates as above, but the drop is after 08:00 — this is where the weekend padding applies.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 14, 8),
    returnAt: istDate(2026, AUG, 15, 9),
  });
  assert.equal(r.lateDrop, true);
  assert.equal(r.days, 3, "late Fri pickup to Sat drop-off takes Friday + Sat/Sun weekend package = 3 days");
  assert.equal(r.dayDates.length, 3);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-14");
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, true, true]);
});

test("Thursday pickup to Saturday drop-off ON TIME (08:00) charges 2 weekdays — no weekend padding on an on-time drop", () => {
  // 13 Aug 2026 is a Thursday. Return AT 08:00 on Saturday is on time, not late.
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 13, 8),
    returnAt: istDate(2026, AUG, 15, 8),
  });
  assert.equal(r.lateDrop, false);
  assert.equal(r.days, 2, "on-time Thu->Sat drop is exactly the 2 weekdays rented, no weekend surcharge");
  assert.equal(r.dayDates.length, 2);
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, false]);
});

test("Thursday pickup to Saturday drop-off LATE (09:00) charges 4 days (2 weekdays + 2 weekend days)", () => {
  const r = computeRentalDays({
    pickupAt: istDate(2026, AUG, 13, 8),
    returnAt: istDate(2026, AUG, 15, 9),
  });
  assert.equal(r.lateDrop, true);
  assert.equal(r.days, 4, "late Thu 08:00 to Sat 09:00 drop takes 2 weekdays + 2 weekend days = 4 days");
  assert.equal(r.dayDates.length, 4);
  assert.deepEqual(r.dayDates.map(isWeekendIst), [false, false, true, true]);
});

test("an invalid date is rejected rather than silently counted", () => {
  assert.throws(() =>
    computeRentalDays({ pickupAt: new Date("nonsense"), returnAt: istDate(2026, AUG, 13, 8) })
  );
});

test("same-day Friday 11:00 AM to 11:00 PM charges exactly 1 weekday day, NOT 3 weekend days", () => {
  // 28 Aug 2026 is a Friday.
  const { parseIstInstant } = require("../src/lib/rental-clock");
  const pickup = parseIstInstant("2026-08-28T11:00");
  const ret = parseIstInstant("2026-08-28T23:00");
  assert.ok(pickup);
  assert.ok(ret);

  const r = computeRentalDays({ pickupAt: pickup, returnAt: ret });
  assert.equal(r.days, 1, "Same-day Friday rental (11:00 to 23:00) must charge exactly 1 day");
  assert.equal(r.lateDrop, true, "23:00 drop is after 08:00 standard drop time");
  assert.equal(r.earlyPickup, false, "11:00 pickup is after 08:00");
  assert.equal(r.dayDates.length, 1);
  assert.equal(istDateKey(r.dayDates[0]), "2026-08-28");
  assert.equal(isWeekendIst(r.dayDates[0]), false, "Friday is a weekday");
});

test("parseIstInstant and toCanonicalIstIso prevent 5.5h UTC timezone shift", () => {
  const { parseIstInstant, toCanonicalIstIso, istParts } = require("../src/lib/rental-clock");

  // String without offset: '2026-08-28T11:00'
  const p1 = parseIstInstant("2026-08-28T11:00");
  assert.ok(p1);
  const parts1 = istParts(p1);
  assert.equal(parts1.year, 2026);
  assert.equal(parts1.month, 7); // Aug
  assert.equal(parts1.day, 28);
  assert.equal(parts1.hour, 11, "Hour must remain 11:00 AM, never shifted to 4:30 PM");
  assert.equal(parts1.minute, 0);

  // Return string without offset: '2026-08-28T23:00' (11:00 PM)
  const r1 = parseIstInstant("2026-08-28T23:00");
  assert.ok(r1);
  const partsR1 = istParts(r1);
  assert.equal(partsR1.year, 2026);
  assert.equal(partsR1.month, 7); // Aug
  assert.equal(partsR1.day, 28);
  assert.equal(partsR1.hour, 23, "Hour must remain 11:00 PM, never shifted to 4:30 AM next day");
  assert.equal(partsR1.minute, 0);

  // Canonical ISO string output
  const iso1 = toCanonicalIstIso("2026-08-28T11:00");
  assert.equal(iso1, "2026-08-28T11:00:00+05:30");

  const isoR1 = toCanonicalIstIso("2026-08-28T23:00");
  assert.equal(isoR1, "2026-08-28T23:00:00+05:30");
});
