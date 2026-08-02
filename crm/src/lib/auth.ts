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

export function getCurrentUser(): SessionUser | null {
  const db = getDb();
  const store = cookies();
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

export function requireUser(roles?: string[]): SessionUser {
  const user = getCurrentUser();
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

export { SESSION_COOKIE };
