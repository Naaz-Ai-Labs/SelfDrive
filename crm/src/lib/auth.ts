import { getDb } from "./db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomToken } from "./utils";
import crypto from "node:crypto";
import { supabaseAdmin } from "./supabase";

const SESSION_COOKIE = "dtt_session";
const SESSION_DAYS = 7;
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || "darshh-crm-session-secret-key-2026";

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

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function createSession(
  userId: number,
  ip?: string,
  userMeta?: { role?: string; email?: string; name?: string }
): string {
  const tokenRaw = randomToken(32);
  const expiresMs = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const expiresISO = new Date(expiresMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  try {
    const db = getDb();
    db.prepare("INSERT INTO sessions (token, user_id, expires_at, ip) VALUES (?, ?, ?, ?)").run(
      tokenRaw,
      userId,
      expiresISO,
      ip ?? null
    );
  } catch {}

  const role = userMeta?.role || "staff";
  const email = userMeta?.email || "";
  const name = userMeta?.name || "";

  const payload = `${userId}:${role}:${expiresMs}:${encodeURIComponent(email)}:${encodeURIComponent(name)}`;
  const sig = signPayload(payload);
  return `${payload}:${sig}:${tokenRaw}`;
}

export function destroySession(token: string) {
  try {
    const parts = token.split(":");
    const tokenRaw = parts.length >= 6 ? parts[5] : token;
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(tokenRaw);
  } catch {}
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  // 1. Verify signed HMAC session token (stateless & instant across Vercel serverless containers)
  const parts = rawToken.split(":");
  if (parts.length >= 5) {
    const [userIdStr, role, expiresMsStr, encEmail, encName, sig] = parts;
    const payload = `${userIdStr}:${role}:${expiresMsStr}:${encEmail}:${encName}`;
    const expectedSig = signPayload(payload);
    const expiresMs = Number(expiresMsStr);

    const isExpired = Date.now() >= expiresMs;
    const sigMatch = sig === expectedSig;

    if (sigMatch && !isExpired) {
      const userId = Number(userIdStr);
      const email = decodeURIComponent(encEmail || "");
      const name = decodeURIComponent(encName || "");

      // Quick SQLite lookup
      try {
        const db = getDb();
        const userRow = db
          .prepare("SELECT id, name, email, role, branch FROM users WHERE (id = ? OR email = ?) AND is_active = 1")
          .get(userId, email.toLowerCase().trim()) as SessionUser | undefined;
        if (userRow) {
          return {
            id: Number(userRow.id),
            name: String(userRow.name),
            email: String(userRow.email),
            role: String(userRow.role) as SessionUser["role"],
            branch: userRow.branch ? String(userRow.branch) : null,
          };
        }
      } catch {}

      // Bulletproof stateless session return: token is HMAC verified and unexpired
      return {
        id: userId,
        name: name || (role === "admin" ? "Administrator" : "Staff User"),
        email: email || "admin@darshhrentals.in",
        role: (role || "staff") as SessionUser["role"],
        branch: null,
      };
    }
  }

  // 2. Fallback to SQLite DB token lookup
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.branch FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1`
      )
      .get(rawToken) as SessionUser | undefined;
    if (row) {
      return {
        id: Number(row.id),
        name: String(row.name),
        email: String(row.email),
        role: String(row.role) as SessionUser["role"],
        branch: row.branch ? String(row.branch) : null,
      };
    }
  } catch {}
  
  console.log("[AUTH_DEBUG] getCurrentUser returned null");
  return null;
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
