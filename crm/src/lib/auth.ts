import { getDb } from "./db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomToken } from "./utils";

const SESSION_COOKIE = "dtt_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  branch: string | null;
};

const ROLE_WEIGHT: Record<string, number> = {
  admin: 100,
  manager: 70,
  finance: 40,
  staff: 20,
};

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function createSession(userId: number, ip?: string): string {
  const db = getDb();
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, ip) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    expires,
    ip ?? null
  );
  return token;
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const db = getDb();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.branch FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1`
    )
    .get(token) as
    | { id: number; name: string; email: string; role: string; branch: string | null }
    | undefined;
  if (!row) return null;
  return row;
}

export async function requireUser(roles?: string[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (roles && !roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export function can(user: SessionUser, minRole: string): boolean {
  return ROLE_WEIGHT[user.role] >= ROLE_WEIGHT[minRole];
}

export function assertCan(user: SessionUser, minRole: string) {
  if (!can(user, minRole)) throw new Error("FORBIDDEN");
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

export function isStaff(user: SessionUser): boolean {
  return user.role === "staff" || user.role === "admin";
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("FORBIDDEN: Admin access required.");
  return user;
}

export function assertAdmin(user: SessionUser) {
  if (!isAdmin(user)) throw new Error("FORBIDDEN: Admin access required.");
}

/** Extensible Role-Based Module Access Permissions */
const MODULE_PERMISSIONS: Record<string, string[]> = {
  "/dashboard": ["admin", "manager", "staff"],
  "/dashboard/enquiries": ["admin", "manager", "staff"],
  "/dashboard/bookings": ["admin", "manager", "staff"],
  "/dashboard/vehicles": ["admin", "manager", "staff"],
  "/dashboard/payments": ["admin", "manager", "staff"],
  "/dashboard/problem-tickets": ["admin", "manager", "staff"],
  "/dashboard/customers": ["admin", "manager", "staff"],
  "/dashboard/refunds": ["admin", "manager"],
  "/dashboard/staff": ["admin"],
  "/dashboard/settings": ["admin"],
  "/dashboard/reports": ["admin"],
};

/** Extensible Role Action Permissions Map */
const ACTION_PERMISSIONS: Record<string, string[]> = {
  manage_staff: ["admin"],
  manage_settings: ["admin"],
  view_analytics: ["admin"],
  view_revenue: ["admin"],
  delete_record: ["admin"],
  restore_record: ["admin"],
  configure_pricing: ["admin"],
  approve_refunds: ["admin"],
  create_enquiry: ["admin", "manager", "staff"],
  create_booking: ["admin", "manager", "staff"],
  edit_booking: ["admin", "manager", "staff"],
  verify_document: ["admin", "manager", "staff"],
  assign_vehicle: ["admin", "manager", "staff"],
  create_ticket: ["admin", "manager", "staff"],
};

export function canAccessModule(role: string, href: string): boolean {
  const allowed = MODULE_PERMISSIONS[href];
  if (!allowed) return true;
  return allowed.includes(role);
}

export function hasPermission(role: string, action: string): boolean {
  const allowed = ACTION_PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function assertPermission(user: SessionUser, action: string) {
  if (!hasPermission(user.role, action)) {
    throw new Error(`FORBIDDEN: ${user.role} role does not have permission to ${action}`);
  }
}

export { SESSION_COOKIE };
