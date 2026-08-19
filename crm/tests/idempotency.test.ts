import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPayload, IdempotencyConflictError, withIdempotency } from "../src/lib/idempotency";

test("hashPayload produces deterministic SHA-256 hashes", () => {
  const p1 = { vehicleId: 5, branchId: 1, name: "Honda Shine" };
  const p2 = { vehicleId: 5, branchId: 1, name: "Honda Shine" };
  const p3 = { vehicleId: 5, branchId: 2, name: "Honda Shine" };

  assert.equal(hashPayload(p1), hashPayload(p2));
  assert.notEqual(hashPayload(p1), hashPayload(p3));
});

test("withIdempotency passes through when no key is provided", async () => {
  let callCount = 0;
  const res = await withIdempotency(null, "test_op", { a: 1 }, async () => {
    callCount += 1;
    return { ok: true, count: callCount };
  });

  assert.equal(res.ok, true);
  assert.equal(res.count, 1);
});

test("withIdempotency handles errors and rethrows", async () => {
  await assert.rejects(
    async () => {
      await withIdempotency("err-key-1", "test_op", { a: 1 }, async () => {
        throw new Error("Simulated failure");
      });
    },
    { message: "Simulated failure" }
  );
});
