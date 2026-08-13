/**
 * Reference numbers and phone normalization.
 *
 * Both of these caused real production failures:
 *   - nextNumber() used a module-level counter that reset on every serverless cold
 *     start, so concurrent lambdas minted identical numbers against UNIQUE NOT NULL
 *     columns (payment_no, receipt_no, invoice_no, refund_no, ticket_no, enquiry_no)
 *     and the insert failed.
 *   - the web fallback normalized phones differently from the CRM, so the same
 *     person resolved to two customer rows.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNumber, normalizePhone, toPaise, toRupees } from "../src/lib/utils";

test("generated numbers are unique across a burst", () => {
  // The old implementation reset its counter per instance; this checks the
  // generator itself carries enough entropy without shared state.
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(nextNumber("PY", null));
  assert.equal(seen.size, 5000, "collision in generated reference numbers");
});

test("numbers carry their prefix and the current year", () => {
  const n = nextNumber("RC", null);
  assert.ok(n.startsWith(`RC-${new Date().getFullYear()}-`), `unexpected shape: ${n}`);
});

test("an explicit id produces a stable, derived number", () => {
  assert.equal(nextNumber("INV", 42), `INV-${new Date().getFullYear()}-00042`);
  assert.equal(nextNumber("INV", 42), nextNumber("INV", 42), "must be deterministic for a given id");
});

test("Indian phone numbers normalize to a single canonical form", () => {
  const expected = "+919845123456";
  assert.equal(normalizePhone("9845123456"), expected, "bare 10-digit");
  assert.equal(normalizePhone("09845123456"), expected, "leading zero");
  assert.equal(normalizePhone("919845123456"), expected, "country code, no plus");
  assert.equal(normalizePhone("+91 98451 23456"), expected, "spaced and plussed");
  assert.equal(normalizePhone("+91-98451-23456"), expected, "hyphenated");
});

test("an empty phone normalizes to empty, not a bare plus", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("   "), "");
});

test("money converts to integer paise without float drift", () => {
  assert.equal(toPaise(1500), 150000);
  assert.equal(toPaise(1499.99), 149999);
  // 0.1 + 0.2 style drift must not leak into a payment amount.
  assert.equal(toPaise(1234.56), 123456);
  assert.equal(Number.isInteger(toPaise(999.99)), true);
});

test("paise round-trips back to rupees", () => {
  assert.equal(toRupees(150000), 1500);
  assert.equal(toRupees(toPaise(2499.5)), 2499.5);
});
