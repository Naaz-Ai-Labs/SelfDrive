import { normalizePhone } from "./utils";
import crypto from "node:crypto";
import { sbSelectOne, sbInsert, sbDelete } from "./supabase-rest";

export type CustomerSession = {
  customerId: number | null;
  target: string;
};

const SESSION_DAYS = 7;

/**
 * Customer portal sessions live in Supabase, not in a per-lambda SQLite file. The
 * previous local mirror was wiped on every cold start, which is what randomly logged
 * portal users out mid-session.
 */
export async function createCustomerSession(customerId: number | null, target: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();

  const res = await sbInsert("customer_sessions", {
    token,
    customer_id: customerId,
    target,
    expires_at: expiresAt,
  });
  if (!res.ok) throw new Error(`Could not start the portal session: ${res.error}`);

  return token;
}

export async function destroyCustomerSession(token: string): Promise<void> {
  const res = await sbDelete("customer_sessions", `token=eq.${encodeURIComponent(token)}`);
  if (!res.ok) console.error("[portal] could not delete customer session:", res.error);
}

export async function getCustomerSession(token: string): Promise<CustomerSession | null> {
  const res = await sbSelectOne<{ customer_id: number | null; target: string }>(
    "customer_sessions",
    `select=customer_id,target&token=eq.${encodeURIComponent(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`
  );
  if (!res.ok || !res.data) return null;
  return { customerId: res.data.customer_id === null ? null : Number(res.data.customer_id), target: res.data.target };
}

export async function findCustomerByTarget(target: string): Promise<{ id: number } | null> {
  const phone = normalizePhone(target);
  const email = target.toLowerCase().trim();

  // Two narrow lookups rather than one PostgREST `or=(...)`: the empty string must never
  // match, and quoting an email inside an or-filter is a needless foot-gun.
  if (phone) {
    const byPhone = await sbSelectOne<{ id: number }>("customers", `select=id&phone=eq.${encodeURIComponent(phone)}`);
    if (byPhone.ok && byPhone.data) return { id: Number(byPhone.data.id) };
  }

  if (email && email.includes("@")) {
    const byEmail = await sbSelectOne<{ id: number }>("customers", `select=id&email=eq.${encodeURIComponent(email)}`);
    if (byEmail.ok && byEmail.data) return { id: Number(byEmail.data.id) };
  }

  return null;
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
