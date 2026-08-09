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
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = fs.existsSync(DB_PATH) ? new DatabaseSync(DB_PATH) : null;

// List of tables to wipe completely for clean fresh start (leaving vehicles, categories, staff, branches, settings intact)
const TABLES_TO_CLEAR = [
  "enquiries",
  "enquiry_history",
  "bookings",
  "booking_history",
  "availability_blocks",
  "customer_documents",
  "inspections",
  "inspection_photos",
  "damage_reports",
  "manual_adjustments",
  "payments",
  "payment_events",
  "refunds",
  "invoices",
  "problem_tickets",
  "messages",
  "notifications",
  "activity_logs",
  "otp_codes",
  "customer_sessions",
];

async function clearEnquiriesAndBookings() {
  console.log("🧹 Starting Complete Wipe of Enquiries, Bookings, Payments & Logs...");

  // 1. Wipe local SQLite DB
  if (sqlite) {
    console.log(`\n📂 Clearing local SQLite DB (${DB_PATH})...`);
    for (const table of TABLES_TO_CLEAR) {
      try {
        sqlite.prepare(`DELETE FROM ${table}`).run();
        console.log(`  ✓ SQLite [${table}]: Cleared all rows.`);
      } catch (err: any) {
        console.warn(`  ⚠️ SQLite [${table}] clear skipped:`, err?.message);
      }
    }
  }

  // 2. Wipe live Supabase DB
  console.log(`\n🌐 Clearing live Supabase PostgreSQL (${SUPABASE_URL})...`);
  for (const table of TABLES_TO_CLEAR) {
    try {
      const col = table === "customer_sessions" ? "token" : "id";
      const val = table === "customer_sessions" ? "" : 0;
      const { error } = await supabase.from(table).delete().neq(col, val);
      if (error) {
        console.warn(`  ⚠️ Supabase [${table}] delete error:`, error.message);
      } else {
        console.log(`  ✅ Supabase [${table}]: Wiped successfully.`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Supabase [${table}] exception:`, err?.message || err);
    }
  }

  console.log("\n=======================================================");
  console.log("✨ ALL ENQUIRIES, BOOKINGS, PAYMENTS & LOGS CLEARED!");
  console.log("=======================================================\n");
}

clearEnquiriesAndBookings().catch(console.error);
