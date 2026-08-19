import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPayload } from "../src/lib/idempotency";

test("payload hash is deterministic and invariant to key ordering", () => {
  const payload1 = {
    vehicleId: 10,
    branchAllocations: [
      { branchId: 1, quantity: 3 },
      { branchId: 2, quantity: 2 },
    ],
    name: "Honda Shine",
  };

  const payload2 = {
    name: "Honda Shine",
    branchAllocations: [
      { branchId: 1, quantity: 3 },
      { branchId: 2, quantity: 2 },
    ],
    vehicleId: 10,
  };

  const hash1 = hashPayload(payload1);
  const hash2 = hashPayload(payload2);

  assert.equal(hash1, hash2, "Key order in payload must produce identical hash");
  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 64, "SHA-256 hex string should be 64 characters");
});

test("payload hash detects parameter alterations", () => {
  const payload1 = { vehicleId: 10, quantity: 5 };
  const payload2 = { vehicleId: 10, quantity: 6 };

  const hash1 = hashPayload(payload1);
  const hash2 = hashPayload(payload2);

  assert.notEqual(hash1, hash2, "Different parameters must yield distinct hashes");
});

test("branch allocation math calculates assigned and unallocated totals correctly", () => {
  const totalUnits = 5;
  const branchAllocs = [
    { branchId: 1, name: "Sakleshpur", quantity: 3 },
    { branchId: 2, name: "Hassan", quantity: 2 },
  ];

  const assignedSum = branchAllocs.reduce((sum, b) => sum + b.quantity, 0);
  const unallocated = totalUnits - assignedSum;

  assert.equal(assignedSum, 5);
  assert.equal(unallocated, 0);
  assert.equal(assignedSum <= totalUnits, true);
});

test("branch allocation validation flags over-allocation", () => {
  const totalUnits = 4;
  const branchAllocs = [
    { branchId: 1, name: "Sakleshpur", quantity: 3 },
    { branchId: 2, name: "Hassan", quantity: 2 },
  ];

  const assignedSum = branchAllocs.reduce((sum, b) => sum + b.quantity, 0);
  const isOverAllocated = assignedSum > totalUnits;

  assert.equal(assignedSum, 5);
  assert.equal(isOverAllocated, true, "Allocating 5 units across 4 total inventory units must fail validation");
});

test("per-unit physical vehicle registration and branch allocation distribution", () => {
  const physicalUnits = [
    { id: 101, unit_identifier: "LEXUS-001", registration_no: "KA-46-M-1111", current_branch_id: 1, status: "available" },
    { id: 102, unit_identifier: "LEXUS-002", registration_no: "KA-46-M-2222", current_branch_id: 1, status: "available" },
    { id: 103, unit_identifier: "LEXUS-003", registration_no: "KA-46-M-3333", current_branch_id: 2, status: "available" },
    { id: 104, unit_identifier: "LEXUS-004", registration_no: "KA-46-M-4444", current_branch_id: 2, status: "available" },
    { id: 105, unit_identifier: "LEXUS-005", registration_no: "KA-46-M-5555", current_branch_id: 2, status: "available" },
  ];

  const branches = [
    { id: 1, name: "Hassan (Main Branch)" },
    { id: 2, name: "Sakleshpura Branch" },
  ];

  // Group by branch
  const branchCounts = new Map<number, { total: number; available: number }>();
  for (const u of physicalUnits) {
    const entry = branchCounts.get(u.current_branch_id) || { total: 0, available: 0 };
    entry.total += 1;
    if (u.status === "available") entry.available += 1;
    branchCounts.set(u.current_branch_id, entry);
  }

  const hassanStats = branchCounts.get(1);
  const sakleshStats = branchCounts.get(2);

  assert.equal(hassanStats?.total, 2, "Hassan should have 2 units");
  assert.equal(hassanStats?.available, 2, "Hassan should have 2 available units");
  assert.equal(sakleshStats?.total, 3, "Sakleshpura should have 3 units");
  assert.equal(sakleshStats?.available, 3, "Sakleshpura should have 3 available units");

  // Verify search query matching "Hassan" returns exactly 2 units, not the 5 fleet total
  const locSearch = "Hassan";
  const branchEntry = branches.find((b) => b.name.toLowerCase().includes(locSearch.toLowerCase()));
  assert.ok(branchEntry);
  const branchResult = branchCounts.get(branchEntry.id);
  assert.equal(branchResult?.available, 2, "Branch-wise search for Hassan must yield 2 available units");
});

test("booking reference resolution query parses numeric id or text booking number", () => {
  function getFilter(ref: string | number) {
    const rawRef = String(ref).trim();
    return /^\d+$/.test(rawRef)
      ? `or=(id.eq.${rawRef},booking_no.eq.${rawRef},booking_no.eq.BK-${rawRef})`
      : `or=(booking_no.eq.${encodeURIComponent(rawRef)},booking_no.eq.${encodeURIComponent(rawRef.replace(/^BK-/i, ""))})`;
  }

  const filter1 = getFilter(12);
  assert.equal(filter1, "or=(id.eq.12,booking_no.eq.12,booking_no.eq.BK-12)");

  const filter2 = getFilter("1786539630");
  assert.equal(filter2, "or=(id.eq.1786539630,booking_no.eq.1786539630,booking_no.eq.BK-1786539630)");

  const filter3 = getFilter("BK-1786539630");
  assert.equal(filter3, "or=(booking_no.eq.BK-1786539630,booking_no.eq.1786539630)");
});
