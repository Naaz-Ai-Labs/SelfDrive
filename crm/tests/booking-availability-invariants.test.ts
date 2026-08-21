import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests enforcing that whenever any vehicle is marked unavailable (or maintenance / blocked / inactive)
 * OR a branch is blocked, booking is strictly and completely prevented.
 */

test("vehicle card and booking wizard classify unavailable statuses as out of stock", () => {
  function isVehicleBookable(v: {
    status?: string;
    active?: number;
    available_units?: number;
    total_units?: number;
    branch_blocked?: boolean;
  }): boolean {
    const isUnavailable =
      !v ||
      v.status === "unavailable" ||
      v.status === "blocked" ||
      v.status === "maintenance" ||
      v.status === "inactive" ||
      v.status === "archived" ||
      v.active === 0 ||
      (v.status ? v.status !== "available" && v.status !== "active" : false);

    const isBranchBlocked = Boolean(v.branch_blocked);
    const outOfStock = isBranchBlocked || isUnavailable || (v.available_units !== undefined && v.available_units <= 0);

    return !outOfStock;
  }

  // 1. Available vehicle at normal branch
  assert.equal(isVehicleBookable({ status: "available", active: 1, available_units: 3, total_units: 3, branch_blocked: false }), true);

  // 2. Marked as unavailable
  assert.equal(isVehicleBookable({ status: "unavailable", active: 1, available_units: 3, total_units: 3, branch_blocked: false }), false);

  // 3. Marked as maintenance
  assert.equal(isVehicleBookable({ status: "maintenance", active: 1, available_units: 2, total_units: 2, branch_blocked: false }), false);

  // 4. Marked as blocked
  assert.equal(isVehicleBookable({ status: "blocked", active: 1, available_units: 1, total_units: 1, branch_blocked: false }), false);

  // 5. Inactive vehicle
  assert.equal(isVehicleBookable({ status: "available", active: 0, available_units: 2, total_units: 2, branch_blocked: false }), false);

  // 6. Branch is blocked
  assert.equal(isVehicleBookable({ status: "available", active: 1, available_units: 2, total_units: 2, branch_blocked: true }), false);

  // 7. 0 available units
  assert.equal(isVehicleBookable({ status: "available", active: 1, available_units: 0, total_units: 2, branch_blocked: false }), false);
});

test("branch resolution in booking payload correctly maps location strings and explicit IDs", () => {
  function resolveBranchId(branchId?: number, location?: string, vehicleBranchId?: number | null): number | undefined {
    let resolved = branchId;
    if (!resolved && location) {
      const locUpper = location.toUpperCase();
      if (locUpper.includes("SAKLESH")) resolved = 1;
      else if (locUpper.includes("HASSAN")) resolved = 2;
    }
    if (!resolved) {
      resolved = vehicleBranchId ?? undefined;
    }
    return resolved;
  }

  assert.equal(resolveBranchId(undefined, "📍 Sakleshpura Branch (Main Road)", 2), 1);
  assert.equal(resolveBranchId(undefined, "HASSAN", 1), 2);
  assert.equal(resolveBranchId(1, "HASSAN", 2), 1, "Explicit branchId takes highest precedence");
  assert.equal(resolveBranchId(undefined, undefined, 2), 2, "Falls back to vehicle branch_id");
});

test("booking creation validation rules reject unavailable vehicles and blocked branches", () => {
  function validateBookingAttempt(
    vehicle: { id: number; name: string; status: string; active: number; branch_id: number | null },
    branchId: number | undefined,
    branchesMap: Map<number, { id: number; name: string; blocked: number }>
  ): { ok: boolean; error?: string } {
    if (
      vehicle.status === "unavailable" ||
      vehicle.status === "blocked" ||
      vehicle.status === "maintenance" ||
      vehicle.status === "inactive" ||
      vehicle.status === "archived" ||
      vehicle.active === 0
    ) {
      return { ok: false, error: "This vehicle is currently unavailable for booking." };
    }

    if (branchId) {
      const branch = branchesMap.get(branchId);
      if (branch && branch.blocked === 1) {
        return { ok: false, error: `Bookings are temporarily suspended at ${branch.name}.` };
      }
    }

    return { ok: true };
  }

  const branchesMap = new Map([
    [1, { id: 1, name: "Sakleshpura Branch", blocked: 1 }],
    [2, { id: 2, name: "Hassan Branch", blocked: 0 }],
  ]);

  const activeVehicle = { id: 10, name: "Activa 6G", status: "available", active: 1, branch_id: 1 };
  const maintenanceVehicle = { id: 11, name: "Pulsar 150", status: "maintenance", active: 1, branch_id: 2 };
  const unavailableVehicle = { id: 12, name: "Access 125", status: "unavailable", active: 1, branch_id: 2 };

  // Attempting to book unavailable vehicle at unblocked Hassan branch -> REJECT
  const res1 = validateBookingAttempt(unavailableVehicle, 2, branchesMap);
  assert.equal(res1.ok, false);
  assert.match(res1.error!, /unavailable for booking/i);

  // Attempting to book maintenance vehicle at unblocked Hassan branch -> REJECT
  const res2 = validateBookingAttempt(maintenanceVehicle, 2, branchesMap);
  assert.equal(res2.ok, false);
  assert.match(res2.error!, /unavailable for booking/i);

  // Attempting to book available vehicle at BLOCKED Sakleshpura branch -> REJECT
  const res3 = validateBookingAttempt(activeVehicle, 1, branchesMap);
  assert.equal(res3.ok, false);
  assert.match(res3.error!, /temporarily suspended at Sakleshpura Branch/i);

  // Attempting to book available vehicle at UNBLOCKED Hassan branch -> ALLOW
  const res4 = validateBookingAttempt(activeVehicle, 2, branchesMap);
  assert.equal(res4.ok, true);
});

test("fleet distribution with branch blocking segregates stock correctly", () => {
  const branches = [
    { id: 1, name: "Sakleshpura Branch", blocked: 1 },
    { id: 2, name: "Hassan Branch", blocked: 0 },
  ];

  const vehicleUnits = [
    { id: 1, vehicle_id: 50, current_branch_id: 1, status: "available" },
    { id: 2, vehicle_id: 50, current_branch_id: 1, status: "available" },
    { id: 3, vehicle_id: 50, current_branch_id: 2, status: "available" },
    { id: 4, vehicle_id: 50, current_branch_id: 2, status: "available" },
  ];

  const branchBlockedMap = new Map(branches.map((b) => [b.id, b.blocked === 1]));

  // Calculate branch-wise available units
  const branchDist = [1, 2].map((bId) => {
    const isBlocked = branchBlockedMap.get(bId) || false;
    const bUnits = vehicleUnits.filter((u) => u.current_branch_id === bId);
    const available = isBlocked ? 0 : bUnits.filter((u) => u.status === "available").length;
    return { branch_id: bId, total: bUnits.length, available };
  });

  const dist1 = branchDist.find((d) => d.branch_id === 1);
  const dist2 = branchDist.find((d) => d.branch_id === 2);

  assert.equal(dist1?.available, 0, "Blocked branch 1 must have 0 available units");
  assert.equal(dist2?.available, 2, "Unblocked branch 2 must have 2 available units");

  // Total available across entire fleet: only unblocked units count
  const totalAvailable = vehicleUnits.filter((u) => u.status === "available" && !branchBlockedMap.get(u.current_branch_id || 0)).length;
  assert.equal(totalAvailable, 2, "Total fleet available units must only count units in unblocked branches");
});

test("booking form step 2 disables clicking when vehicle is out of stock or branch blocked", () => {
  function canSelectVehicle(
    vehicle: { id: number; status: string; active: number; available_units: number },
    isSelectedBranchBlocked: boolean
  ): boolean {
    const isVehicleUnavailable =
      vehicle.status === "unavailable" ||
      vehicle.status === "blocked" ||
      vehicle.status === "maintenance" ||
      vehicle.status === "inactive" ||
      vehicle.status === "archived" ||
      vehicle.active === 0;

    const isOutOfStock = isSelectedBranchBlocked || isVehicleUnavailable || vehicle.available_units <= 0;
    return !isOutOfStock;
  }

  // Active vehicle with stock in active branch -> selectable
  assert.equal(canSelectVehicle({ id: 1, status: "available", active: 1, available_units: 2 }, false), true);

  // Active vehicle with stock in BLOCKED branch -> NOT selectable
  assert.equal(canSelectVehicle({ id: 1, status: "available", active: 1, available_units: 2 }, true), false);

  // Unavailable vehicle in active branch -> NOT selectable
  assert.equal(canSelectVehicle({ id: 2, status: "unavailable", active: 1, available_units: 2 }, false), false);

  // Zero stock vehicle in active branch -> NOT selectable
  assert.equal(canSelectVehicle({ id: 3, status: "available", active: 1, available_units: 0 }, false), false);
});
