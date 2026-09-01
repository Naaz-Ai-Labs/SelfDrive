import { test } from "node:test";
import assert from "node:assert/strict";
import { unitStatusChangeNeedsReason } from "../src/lib/actions";

/** DIO-001 and ACTIVA-001 both went stuck "unavailable" with no booking, no block, and
 * no recorded reason — invisible on the timeline, silently subtracted from every future
 * date, undetected for hours. This is the one rule closing that gap for every vehicle,
 * from either place a unit's status can be set. */

test("marking a unit out of service with no reason is refused", async () => {
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "available", undefined), true);
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "available", ""), true);
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "available", "   "), true);
  assert.equal(await unitStatusChangeNeedsReason("blocked", "available", undefined), true);
  assert.equal(await unitStatusChangeNeedsReason("booked", "available", undefined), true);
  assert.equal(await unitStatusChangeNeedsReason("transit", "available", undefined), true);
});

test("marking a unit out of service WITH a reason is allowed", async () => {
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "available", "Engine service"), false);
});

test("re-saving a unit that was already out of service does not nag for a reason again", async () => {
  // Same status in, same status out — this is exactly the "one accidental click stays
  // invisible forever" pattern; re-saving other fields on an already-flagged unit must
  // not be blocked by a reason nobody is being asked to newly justify.
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "unavailable", undefined), false);
});

test("returning a unit to available never requires a reason", async () => {
  assert.equal(await unitStatusChangeNeedsReason("available", "unavailable", undefined), false);
});

test("a brand-new unit born out of service still requires a reason", async () => {
  // previousStatus "" never equals a real status, so this is always a transition.
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "", undefined), true);
  assert.equal(await unitStatusChangeNeedsReason("unavailable", "", "Awaiting registration"), false);
});
