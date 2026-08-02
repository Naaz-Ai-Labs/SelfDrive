import { getDb } from "./db";
import { normalizePhone } from "./utils";
import crypto from "node:crypto";

export type CustomerSession = {
  customerId: number | null;
  target: string;
};

export function createCustomerSession(customerId: number | null, target: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  getDb()
    .prepare("INSERT INTO customer_sessions (token, customer_id, target, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, customerId, target, expires);
  return token;
}

export function destroyCustomerSession(token: string) {
  getDb().prepare("DELETE FROM customer_sessions WHERE token = ?").run(token);
}

export function getCustomerSession(token: string): CustomerSession | null {
  const row = getDb()
    .prepare(
      "SELECT customer_id, target FROM customer_sessions WHERE token = ? AND expires_at > datetime('now')"
    )
    .get(token) as { customer_id: number | null; target: string } | undefined;
  if (!row) return null;
  return { customerId: row.customer_id, target: row.target };
}

export function findCustomerByTarget(target: string): { id: number } | null {
  const db = getDb();
  const phone = normalizePhone(target);
  const email = target.toLowerCase().trim();
  const row = db
    .prepare("SELECT id FROM customers WHERE (phone = ? AND phone IS NOT NULL AND phone != '') OR (email = ? AND email IS NOT NULL AND email != '') LIMIT 1")
    .get(phone, email) as { id: number } | undefined;
  return row ?? null;
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
