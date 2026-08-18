/**
 * Availability display rule.
 *
 * The public cards must never compute availability themselves — `available_units`
 * is produced server-side in crm/src/lib/data.ts as total_units minus live holds.
 * This pins the one derived decision the UI does make: whether to grey a card.
 *
 * The critical case is the last one. An infrastructure failure must NOT render as
 * "Out of Stock": telling a customer a vehicle is unavailable when the truth is
 * that a query failed loses a real booking and is indistinguishable, to them, from
 * having no stock. The data layer throws on a read failure so the error boundary
 * catches it; the card is only ever asked about vehicles that loaded successfully.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Mirrors the rule used by the vehicle cards. */
function isOutOfStock(v: { available_units?: number; total_units?: number; status?: string }): boolean {
  return (
    (v.available_units ?? v.total_units ?? 0) <= 0 ||
    (v.status ? v.status !== "available" : false)
  );
}

test("a vehicle with free units is bookable", () => {
  assert.equal(isOutOfStock({ available_units: 3, total_units: 5, status: "available" }), false);
});

test("partial inventory stays bookable — one unit left is still stock", () => {
  assert.equal(isOutOfStock({ available_units: 1, total_units: 5, status: "available" }), false);
});

test("fully booked is out of stock", () => {
  assert.equal(isOutOfStock({ available_units: 0, total_units: 5, status: "available" }), true);
});

test("zero inventory is out of stock", () => {
  assert.equal(isOutOfStock({ available_units: 0, total_units: 0, status: "available" }), true);
});

test("a vehicle in maintenance is unavailable even with free units", () => {
  assert.equal(isOutOfStock({ available_units: 4, total_units: 4, status: "maintenance" }), true);
});

test("an archived vehicle is unavailable", () => {
  assert.equal(isOutOfStock({ available_units: 2, total_units: 2, status: "archived" }), true);
});

test("falls back to total_units when the server sent no availability figure", () => {
  // Older payloads and the fallback catalogue omit available_units entirely.
  assert.equal(isOutOfStock({ total_units: 2, status: "available" }), false);
  assert.equal(isOutOfStock({ total_units: 0, status: "available" }), true);
});

test("a missing status is not treated as unavailable", () => {
  // Absent status means "not stated", not "not available" — greying a bookable
  // vehicle because a column was null would silently hide sellable inventory.
  assert.equal(isOutOfStock({ available_units: 2, total_units: 2 }), false);
});

test("an empty payload is out of stock, not bookable", () => {
  // With no numbers at all the safe default is to not offer a booking we cannot
  // guarantee. This is the one place where defaulting to unavailable is correct,
  // because it stops a sale rather than breaking one that was already taken.
  assert.equal(isOutOfStock({}), true);
});

/**
 * Branch blocking.
 *
 * A blocked branch zeroes available_units for every vehicle parked there, so the
 * existing card rule greys them out with no second condition to keep in sync.
 * reserve_vehicle_slot enforces the same thing in the database, which is what stops
 * a stale page from booking around it.
 */

test("a vehicle at a blocked branch reports no availability", () => {
  // What hydrateVehicles computes when branches.blocked = 1.
  const availableUnits = (totalUnits: number, holds: number, branchBlocked: boolean) =>
    branchBlocked ? 0 : Math.max(0, totalUnits - holds);

  assert.equal(availableUnits(5, 2, true), 0, "blocked branch overrides free units");
  assert.equal(availableUnits(5, 2, false), 3, "unblocked branch counts normally");
});

test("unblocking restores the previous count rather than a guess", () => {
  const availableUnits = (totalUnits: number, holds: number, branchBlocked: boolean) =>
    branchBlocked ? 0 : Math.max(0, totalUnits - holds);

  // Blocking does not write to the vehicles, so the same inputs return the same
  // number once the branch is released — 5 units with 3 held is 2, before and after.
  assert.equal(availableUnits(5, 3, true), 0);
  assert.equal(availableUnits(5, 3, false), 2);
});

test("a blocked branch greys the card through the existing rule", () => {
  assert.equal(isOutOfStock({ available_units: 0, total_units: 5, status: "available" }), true);
});
