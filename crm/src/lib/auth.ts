import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomToken } from "./utils";
import crypto from "node:crypto";
import { sbSelectOne, sbInsert, sbDelete } from "./supabase-rest";

const SESSION_COOKIE = "dtt_session";
const SESSION_DAYS = 7;
/** Session signing key. Must be a dedicated secret — never a hardcoded literal, and
 * never reused from another system. SUPABASE_SECRET_KEY is tolerated only as a
 * transitional fallback so existing sessions keep working; it is logged loudly so the
 * deployment gets a real SESSION_SECRET set. */
function resolveSessionSecret(): string {
  const dedicated = process.env.SESSION_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;

  const transitional = process.env.SUPABASE_SECRET_KEY;
  if (transitional && transitional.length >= 32) {
    console.error(
      "[SECURITY] SESSION_SECRET is not set. Falling back to SUPABASE_SECRET_KEY for session signing. " +
        "Set a dedicated SESSION_SECRET (32+ random bytes) in the environment — reusing the database key for " +
        "session HMACs means one leak compromises both."
    );
    return transitional;
  }

  throw new Error(
    "SESSION_SECRET is not configured. Refusing to sign sessions with a default key. " +
      "Set SESSION_SECRET (32+ random bytes) in the environment."
  );
}

const SESSION_SECRET = resolveSessionSecret();

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

/** The opaque half of a composed cookie value, i.e. the `sessions.token` primary key.
 * A raw (uncomposed) token is returned as-is so legacy cookies still resolve. */
function rawTokenOf(token: string): string {
  const parts = token.split(":");
  return parts.length >= 6 ? parts[5] : token;
}

/**
 * Mints the session cookie value. Deliberately synchronous so every existing caller
 * keeps working; the durable `sessions` row is written by `persistSession` below,
 * which the auth routes await. The cookie itself is self-contained (HMAC signed), so
 * a failed row write degrades revocation, not login.
 */
export function createSession(
  userId: number,
  ip?: string,
  userMeta?: { role?: string; email?: string; name?: string }
): string {
  const tokenRaw = randomToken(32);
  const expiresMs = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;

  const role = userMeta?.role || "staff";
  const email = userMeta?.email || "";
  const name = userMeta?.name || "";

  const payload = `${userId}:${role}:${expiresMs}:${encodeURIComponent(email)}:${encodeURIComponent(name)}`;
  const sig = signPayload(payload);
  return `${payload}:${sig}:${tokenRaw}`;
}

/** Writes the durable `sessions` row for a cookie produced by `createSession`. */
export async function persistSession(token: string, userId: number, ip?: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  const res = await sbInsert("sessions", {
    token: rawTokenOf(token),
    user_id: userId,
    expires_at: expiresAt,
    ip: ip ?? null,
  });
  if (!res.ok) console.error("[auth] could not persist session row:", res.error);
}

export async function destroySession(token: string): Promise<void> {
  const res = await sbDelete("sessions", `token=eq.${encodeURIComponent(rawTokenOf(token))}`);
  if (!res.ok) console.error("[auth] could not delete session row:", res.error);
}

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  branch: string | null;
  is_active: number;
};

const USER_COLUMNS = "select=id,name,email,role,branch,is_active";

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    branch: row.branch ? String(row.branch) : null,
  };
}

/** `users.is_active` is declared INTEGER NOT NULL DEFAULT 1 in supabase/schema.sql. */
function isActive(row: UserRow): boolean {
  return Number(row.is_active) === 1;
}

/**
 * Looks the cookie's subject up in Supabase.
 *
 * Three outcomes, deliberately distinguished by the caller:
 *  - `{ reachable: true, user }`  — Supabase answered and the account is live.
 *  - `{ reachable: true, user: null }` — Supabase answered: absent or deactivated. Deny.
 *  - `{ reachable: false }` — Supabase could not be consulted. The caller may fall back
 *    to the signed identity so an outage does not log the whole company out.
 */
async function lookupUser(
  userId: number,
  email: string
): Promise<{ reachable: true; user: SessionUser | null } | { reachable: false }> {
  const cleanEmail = email.toLowerCase().trim();

  if (Number.isFinite(userId) && userId > 0) {
    const byId = await sbSelectOne<UserRow>("users", `${USER_COLUMNS}&id=eq.${userId}`);
    if (!byId.ok) return { reachable: false };
    if (byId.data) return { reachable: true, user: isActive(byId.data) ? toSessionUser(byId.data) : null };
  }

  if (cleanEmail) {
    const byEmail = await sbSelectOne<UserRow>("users", `${USER_COLUMNS}&email=eq.${encodeURIComponent(cleanEmail)}`);
    if (!byEmail.ok) return { reachable: false };
    if (byEmail.data) return { reachable: true, user: isActive(byEmail.data) ? toSessionUser(byEmail.data) : null };
  }

  return { reachable: true, user: null };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  // 1. Verify signed HMAC session token (stateless & instant across serverless containers).
  //    The signature only proves *which* account the cookie claims; role and account
  //    standing always come from the database row below.
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

      const lookup = await lookupUser(userId, email);

      if (lookup.reachable) {
        // Supabase answered. Its verdict is final — including "this account is gone",
        // which is what makes deactivating a staff member take effect immediately.
        if (!lookup.user) {
          console.warn(`[auth] rejecting session for user ${userId}: absent or inactive in Supabase.`);
          return null;
        }
        return lookup.user;
      }

      // Supabase could not be consulted. Ride out the outage on the signed identity
      // rather than logging everyone out; the role here is the cookie's, so it is only
      // ever as trustworthy as the signing secret.
      console.error("[auth] Supabase unreachable — falling back to the signed session identity.");
      return {
        id: userId,
        name: name || (role === "admin" ? "Administrator" : "Staff User"),
        email,
        role: role || "staff",
        branch: null,
      };
    }
  }

  // 2. Legacy / opaque cookie: resolve it through the sessions table.
  const session = await sbSelectOne<{ user_id: number }>(
    "sessions",
    `select=user_id&token=eq.${encodeURIComponent(rawTokenOf(rawToken))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`
  );

  if (session.ok && session.data) {
    const lookup = await lookupUser(Number(session.data.user_id), "");
    if (lookup.reachable && lookup.user) return lookup.user;
  }

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
