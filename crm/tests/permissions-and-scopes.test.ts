process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long-1234567890";

import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVICE_SCOPES,
  DEFAULT_ROLE_SCOPES,
  parsePermissions,
  pathToScope,
  canAccessModule,
  type SessionUser,
} from "../src/lib/auth";

test("DEFAULT_ROLE_SCOPES covers all predefined roles", () => {
  assert.ok(DEFAULT_ROLE_SCOPES.admin.length === SERVICE_SCOPES.length);
  assert.ok(DEFAULT_ROLE_SCOPES.manager.includes("bookings"));
  assert.ok(DEFAULT_ROLE_SCOPES.manager.includes("reports"));
  assert.ok(!DEFAULT_ROLE_SCOPES.manager.includes("staff")); // Staff mgmt is admin only by default
  assert.ok(DEFAULT_ROLE_SCOPES.finance.includes("payments"));
  assert.ok(DEFAULT_ROLE_SCOPES.finance.includes("refunds"));
  assert.ok(!DEFAULT_ROLE_SCOPES.finance.includes("vehicles"));
});

test("parsePermissions handles arrays, valid JSON strings, invalid JSON, and nulls", () => {
  assert.deepEqual(parsePermissions(["bookings", "enquiries"], "staff"), ["bookings", "enquiries"]);
  assert.deepEqual(parsePermissions('["vehicles","allocations"]', "staff"), ["vehicles", "allocations"]);
  assert.deepEqual(parsePermissions("invalid-json", "finance"), DEFAULT_ROLE_SCOPES.finance);
  assert.deepEqual(parsePermissions(null, "staff"), DEFAULT_ROLE_SCOPES.staff);
  assert.deepEqual(parsePermissions(undefined, "admin"), DEFAULT_ROLE_SCOPES.admin);
});

test("pathToScope correctly resolves all dashboard paths", () => {
  assert.equal(pathToScope("/dashboard/bookings"), "bookings");
  assert.equal(pathToScope("/dashboard/bookings/102"), "bookings");
  assert.equal(pathToScope("/dashboard/enquiries"), "enquiries");
  assert.equal(pathToScope("/dashboard/vehicles"), "vehicles");
  assert.equal(pathToScope("/dashboard/allocations"), "allocations");
  assert.equal(pathToScope("/dashboard/payments"), "payments");
  assert.equal(pathToScope("/dashboard/refunds"), "refunds");
  assert.equal(pathToScope("/dashboard/problem-tickets"), "problem_tickets");
  assert.equal(pathToScope("/dashboard/customers"), "customers");
  assert.equal(pathToScope("/dashboard/reports"), "reports");
  assert.equal(pathToScope("/dashboard/settings"), "settings");
  assert.equal(pathToScope("/dashboard/staff"), "staff");
  assert.equal(pathToScope("/dashboard"), null); // Overview home
});

test("canAccessModule enforces granular scopes for staff users", () => {
  const customStaff: SessionUser = {
    id: 42,
    name: "Custom Agent",
    email: "custom@darshh.com",
    role: "staff",
    branch: "Hassan Branch",
    permissions: ["bookings", "vehicles"],
  };

  // Permitted scopes
  assert.equal(canAccessModule(customStaff, "/dashboard"), true); // Overview is always accessible
  assert.equal(canAccessModule(customStaff, "/dashboard/bookings"), true);
  assert.equal(canAccessModule(customStaff, "/dashboard/vehicles"), true);

  // Restricted scopes
  assert.equal(canAccessModule(customStaff, "/dashboard/payments"), false);
  assert.equal(canAccessModule(customStaff, "/dashboard/refunds"), false);
  assert.equal(canAccessModule(customStaff, "/dashboard/reports"), false);
  assert.equal(canAccessModule(customStaff, "/dashboard/staff"), false);
  assert.equal(canAccessModule(customStaff, "/dashboard/settings"), false);
});

test("canAccessModule allows unrestricted access to admin role regardless of permissions array", () => {
  const adminUser: SessionUser = {
    id: 1,
    name: "Super Admin",
    email: "admin@darshh.com",
    role: "admin",
    branch: null,
    permissions: [],
  };

  assert.equal(canAccessModule(adminUser, "/dashboard/bookings"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/vehicles"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/payments"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/refunds"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/reports"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/settings"), true);
  assert.equal(canAccessModule(adminUser, "/dashboard/staff"), true);
});
