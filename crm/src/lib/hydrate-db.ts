import { createClient } from "@supabase/supabase-js";
import type { DatabaseSync } from "./db";

const TABLES_ORDERED = [
  "users",
  "branches",
  "vehicle_categories",
  "vehicles",
  "vehicle_photos",
  "pricing_rules",
  "availability_blocks",
  "terms_versions",
  "customers",
  "enquiries",
  "enquiry_history",
  "bookings",
  "booking_history",
  "customer_documents",
  "inspections",
  "inspection_photos",
  "damage_reports",
  "manual_adjustments",
  "payments",
  "refunds",
  "invoices",
  "problem_tickets",
  "maintenance_records",
  "tasks",
  "messages",
  "message_templates",
  "notifications",
  "documents",
  "feedback",
  "testimonials",
  "gallery",
  "blog_posts",
  "faqs",
  "otp_codes",
  "sessions",
  "customer_sessions",
  "activity_logs",
  "settings",
];

export async function hydrateSQLiteFromSupabase(db: DatabaseSync): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.warn("⚠️ Supabase credentials not found for DB hydration.");
    return false;
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    console.log("🌐 Hydrating SQLite from Supabase production...");

    // Fetch all tables in parallel
    const results = await Promise.all(
      TABLES_ORDERED.map((table) => supabase.from(table).select("*"))
    );

    let totalInserted = 0;

    for (let idx = 0; idx < TABLES_ORDERED.length; idx++) {
      const table = TABLES_ORDERED[idx];
      const res = results[idx];

      if (res.error) {
        console.warn(`⚠️ Hydration skipped [${table}]:`, res.error.message);
        continue;
      }

      const rows = res.data as Record<string, unknown>[] | null;
      if (!rows || rows.length === 0) continue;

      // Get table column names from SQLite PRAGMA
      const pragma = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const sqliteCols = new Set(pragma.map((p) => p.name));

      for (const row of rows) {
        // Filter out fields not present in SQLite table
        const keys = Object.keys(row).filter((k) => sqliteCols.has(k) && row[k] !== undefined);
        if (keys.length === 0) continue;

        const colsStr = keys.join(", ");
        const placeholdersStr = keys.map(() => "?").join(", ");
        const values = keys.map((k) => row[k]);

        try {
          db.prepare(`INSERT OR REPLACE INTO ${table} (${colsStr}) VALUES (${placeholdersStr})`).run(...values);
          totalInserted++;
        } catch (err: any) {
          // Ignore constraint warnings during bulk sync
        }
      }
    }

    console.log(`✅ Supabase hydration complete: ${totalInserted} rows loaded into SQLite.`);
    return true;
  } catch (err: any) {
    console.warn("⚠️ Supabase hydration exception:", err?.message || err);
    return false;
  }
}

/** Live delta sync to fetch latest bookings, payments, and customers from Supabase into SQLite */
export async function syncLatestFromSupabase(db: DatabaseSync): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return false;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const syncTables = ["customers", "enquiries", "bookings", "payments", "booking_history"];
    const results = await Promise.all(
      syncTables.map((t) => supabase.from(t).select("*").order("created_at", { ascending: false }).limit(100))
    );

    for (let idx = 0; idx < syncTables.length; idx++) {
      const table = syncTables[idx];
      const res = results[idx];
      if (res.error || !res.data || res.data.length === 0) continue;

      const pragma = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const sqliteCols = new Set(pragma.map((p) => p.name));

      for (const row of res.data) {
        const keys = Object.keys(row).filter((k) => sqliteCols.has(k) && row[k] !== undefined);
        if (keys.length === 0) continue;

        const colsStr = keys.join(", ");
        const placeholdersStr = keys.map(() => "?").join(", ");
        const values = keys.map((k) => row[k]);

        try {
          db.prepare(`INSERT OR REPLACE INTO ${table} (${colsStr}) VALUES (${placeholdersStr})`).run(...values);
        } catch {}
      }
    }
    return true;
  } catch (err: any) {
    console.warn("⚠️ Live Supabase sync warning:", err?.message || err);
    return false;
  }
}
