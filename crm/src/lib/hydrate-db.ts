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

async function fetchSupabaseRest(table: string): Promise<Record<string, unknown>[] | null> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>[];
  } catch (err: any) {
    console.warn(`⚠️ Supabase REST fetch error [${table}]:`, err?.message || err);
    return null;
  }
}

export async function hydrateSQLiteFromSupabase(db: DatabaseSync): Promise<boolean> {
  console.log("🌐 Hydrating SQLite from Supabase production via Direct REST...");
  try {
    const results = await Promise.all(TABLES_ORDERED.map((table) => fetchSupabaseRest(table)));
    let totalInserted = 0;

    for (let idx = 0; idx < TABLES_ORDERED.length; idx++) {
      const table = TABLES_ORDERED[idx];
      const rows = results[idx];
      if (!rows || rows.length === 0) continue;

      const pragma = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const sqliteCols = new Set(pragma.map((p) => p.name));

      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => sqliteCols.has(k) && row[k] !== undefined);
        if (keys.length === 0) continue;

        const colsStr = keys.join(", ");
        const placeholdersStr = keys.map(() => "?").join(", ");
        const values = keys.map((k) => row[k]);

        try {
          db.prepare(`INSERT OR REPLACE INTO ${table} (${colsStr}) VALUES (${placeholdersStr})`).run(...values);
          totalInserted++;
        } catch {}
      }
    }

    console.log(`✅ Supabase hydration complete: ${totalInserted} rows loaded into SQLite.`);
    return true;
  } catch (err: any) {
    console.warn("⚠️ Supabase hydration exception:", err?.message || err);
    return false;
  }
}

/** Live delta sync to fetch latest bookings, payments, customers and documents from Supabase into SQLite */
export async function syncLatestFromSupabase(db: DatabaseSync): Promise<boolean> {
  const syncTables = ["customers", "enquiries", "bookings", "payments", "customer_documents", "booking_history"];
  try {
    const results = await Promise.all(syncTables.map((t) => fetchSupabaseRest(t)));

    for (let idx = 0; idx < syncTables.length; idx++) {
      const table = syncTables[idx];
      const rows = results[idx];
      if (!rows || rows.length === 0) continue;

      const pragma = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const sqliteCols = new Set(pragma.map((p) => p.name));

      for (const row of rows) {
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
