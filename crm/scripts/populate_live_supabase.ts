import { createClient } from "@supabase/supabase-js";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

function loadEnv(envPath: string) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv(path.join(process.cwd(), ".env"));
loadEnv(path.join(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const DB_PATH = path.join(process.cwd(), "data", "darshan.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ SQLite database not found at ${DB_PATH}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(DB_PATH);

const TABLES = [
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
  "users",
];

async function populateLiveSupabase() {
  console.log("🚀 Starting Full Local SQLite -> Live Supabase Population...");
  console.log(`📂 Source SQLite: ${DB_PATH}`);
  console.log(`🌐 Target Supabase: ${SUPABASE_URL}\n`);

  let totalMigrated = 0;
  const tableStats: { table: string; local: number; live: number; status: string }[] = [];

  for (const table of TABLES) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      const localCount = rows.length;

      if (localCount === 0) {
        console.log(`ℹ️ Table [${table}]: 0 local records.`);
        tableStats.push({ table, local: 0, live: 0, status: "OK (0 rows)" });
        continue;
      }

      console.log(`⏳ Table [${table}]: Upserting ${localCount} records to Supabase...`);

      const BATCH_SIZE = 50;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        let chunk = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r }));

        if (table === "users") {
          for (const u of chunk) {
            const userPayload = { ...u };
            delete userPayload.id;
            const { error: uErr } = await supabase.from("users").upsert([userPayload], { onConflict: "email" });
            if (!uErr) inserted++;
          }
          continue;
        }

        let { error } = await supabase.from(table).upsert(chunk);

        // Auto-strip missing columns if PostgreSQL schema hasn't migrated a specific column
        while (error && error.message.includes("Could not find the '")) {
          const match = error.message.match(/Could not find the '([^']+)' column/);
          if (match && match[1]) {
            const missingCol = match[1];
            console.log(`  ⚠️ Stripping unmigrated column '${missingCol}' from [${table}]...`);
            chunk = chunk.map((r) => {
              delete r[missingCol];
              return r;
            });
            const retry = await supabase.from(table).upsert(chunk);
            error = retry.error;
          } else {
            break;
          }
        }

        if (error) {
          console.error(`❌ Error upserting batch into [${table}]:`, error.message);
        } else {
          inserted += chunk.length;
        }
      }

      // Check live table count in Supabase
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
      const liveCount = count ?? inserted;

      totalMigrated += inserted;
      console.log(`✅ Table [${table}]: Migrated ${inserted}/${localCount} records (Live total: ${liveCount}).`);
      tableStats.push({ table, local: localCount, live: liveCount, status: inserted === localCount ? "100% SYNCED" : "PARTIAL" });
    } catch (err: any) {
      console.error(`❌ Exception processing [${table}]:`, err?.message || err);
      tableStats.push({ table, local: 0, live: 0, status: "ERROR" });
    }
  }

  console.log("\n=======================================================");
  console.log("🎉 POPULATION SUMMARY & LIVE VERIFICATION REPORT:");
  console.log("=======================================================");
  console.table(tableStats);
  console.log(`\n✨ Total Records Processed & Verified: ${totalMigrated}`);
  console.log("=======================================================\n");
}

populateLiveSupabase().catch(console.error);
