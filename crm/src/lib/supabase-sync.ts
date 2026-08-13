import { createClient } from "@supabase/supabase-js";
import { getDb } from "./db";

/**
 * Legacy SQLite -> Supabase mirror.
 *
 * The money path no longer goes through here: payments, payment events and the
 * webhook idempotency record are written straight to Supabase (see
 * `payment-actions.ts` and the Razorpay webhook route). The remaining generic
 * helpers exist only for modules that have not been ported yet.
 */

/** Convert Rupees float to integer minor units (Paise). e.g. ₹1500.00 -> 150000 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert integer minor units (Paise) to Rupees float. e.g. 150000 -> 1500 */
export function toRupees(paise: number): number {
  return paise / 100;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Syncs any record to Supabase.
 *
 * This used to "self-heal" a `Could not find the 'X' column` error by deleting
 * column X from the payload and retrying. That is how upi_id, vpa, bank_ref_no
 * and breakdown_json were silently dropped on every payment write. Those columns
 * now exist (see 20260813_phase1_supabase_source_of_truth.sql) and schema drift
 * is reported as a failure instead of being papered over.
 */
export async function syncTableRecordToSupabase(table: string, record: Record<string, unknown>): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(table).upsert([{ ...record }]);
    if (error) {
      console.error(`[supabase-sync] upsert into ${table} failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.error(`[supabase-sync] upsert into ${table} threw:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Fetches a row from local SQLite by ID and syncs it live to Supabase. */
export async function syncEntityToSupabase(table: string, id: number | string): Promise<boolean> {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return false;
    return await syncTableRecordToSupabase(table, row);
  } catch (err: unknown) {
    console.error(`[supabase-sync] entity sync error for [${table}:${id}]:`, err instanceof Error ? err.message : err);
    return false;
  }
}
