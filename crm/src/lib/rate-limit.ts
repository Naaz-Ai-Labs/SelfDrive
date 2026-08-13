import { sbRpc } from "./supabase-rest";

/**
 * Shared, cross-instance rate limiting.
 *
 * Replaces module-level `Map` counters, which on serverless are per-lambda and reset
 * on every cold start — a "5 attempts then block" rule was really 5 attempts per
 * warm instance, and a cold start wiped the count entirely.
 *
 * Backed by Postgres (see 20260814_shared_rate_limits.sql) rather than Redis,
 * because the database is already a hard dependency of every route that calls this,
 * and the Redis helper silently degrades to in-process memory when its credentials
 * are missing — which is exactly the failure mode being fixed here.
 */

export type RateLimitOptions = {
  /** Opaque key. Never include a raw OTP, password or token. */
  key: string;
  maxAttempts: number;
  windowSeconds: number;
  /** How long to lock out after the limit is breached. 0 = no extended block. */
  blockSeconds?: number;
};

/**
 * Records an attempt and reports whether the caller may proceed.
 *
 * Fails CLOSED: if the counter cannot be read or written, the request is denied.
 * These guards protect credential endpoints, so an unavailable dependency must not
 * become an open door.
 */
export async function consumeRateLimit(opts: RateLimitOptions): Promise<{ allowed: boolean; reason?: string }> {
  const res = await sbRpc<boolean>("consume_rate_limit", {
    p_key: opts.key,
    p_max_attempts: opts.maxAttempts,
    p_window_seconds: opts.windowSeconds,
    p_block_seconds: opts.blockSeconds ?? 0,
  });

  if (!res.ok) {
    console.error(`[rate-limit] counter unavailable for "${opts.key}" — denying: ${res.error}`);
    return { allowed: false, reason: "unavailable" };
  }

  return { allowed: res.data === true };
}

/** Clears the counter after a legitimate success. */
export async function resetRateLimit(key: string): Promise<void> {
  const res = await sbRpc("reset_rate_limit", { p_key: key });
  if (!res.ok) console.warn(`[rate-limit] could not reset "${key}": ${res.error}`);
}
