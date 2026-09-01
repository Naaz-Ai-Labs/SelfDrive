import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

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
  "users",
  "sessions",
  "customers",
  "branches",
  "vehicle_categories",
  "vehicles",
  "vehicle_photos",
  "pricing_rules",
  "availability_blocks",
  "terms_versions",
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
  "customer_sessions",
  "activity_logs",
  "settings",
];

async function migrate() {
  console.log("🚀 Starting SQLite to Supabase Migration...");
  console.log(`📂 Source DB: ${DB_PATH}`);
  console.log(`🌐 Target Supabase: ${SUPABASE_URL}\n`);

  let totalRowsMigrated = 0;
  const missingTables: string[] = [];
  const columnMismatches: { table: string; column: string }[] = [];
  const successfulTables: string[] = [];

  for (const table of TABLES) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`ℹ️  Table [${table}]: 0 rows found in SQLite database.`);
        successfulTables.push(table);
        continue;
      }

      console.log(`⏳ Table [${table}]: Attempting to migrate ${rows.length} rows...`);

      const BATCH_SIZE = 100;
      let insertedCount = 0;
      let tableNotFound = false;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        let chunk = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r }));

        let { error } = await supabase.from(table).upsert(chunk);

        // If missing column error occurs, strip column and retry batch
        while (error && error.message.includes("Could not find the '")) {
          const match = error.message.match(/Could not find the '([^']+)' column/);
          if (match && match[1]) {
            const missingCol = match[1];
            columnMismatches.push({ table, column: missingCol });
            console.log(`  ⚠️ Column '${missingCol}' missing in Supabase [${table}], stripping and retrying batch...`);
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
          if (
            error.code === "42P01" ||
            error.message.includes("Could not find the table")
          ) {
            tableNotFound = true;
            break;
          } else {
            console.error(`❌ Error migrating [${table}]:`, error.message);
            break;
          }
        } else {
          insertedCount += chunk.length;
        }
      }

      if (tableNotFound) {
        console.log(`⚠️  Table [${table}] does not exist in Supabase yet.`);
        missingTables.push(table);
      } else if (insertedCount > 0) {
        console.log(`✅ Table [${table}]: Successfully migrated ${insertedCount} rows.`);
        totalRowsMigrated += insertedCount;
        successfulTables.push(table);
      }
    } catch (err: any) {
      console.error(`❌ Unexpected error processing table [${table}]:`, err?.message || err);
    }
  }

  console.log("\n==========================================");
  console.log(`🎉 Migration Execution Summary:`);
  console.log(`- Tables existing & updated: ${successfulTables.length}/${TABLES.length}`);
  console.log(`- Total records inserted: ${totalRowsMigrated}`);

  if (missingTables.length > 0 || columnMismatches.length > 0) {
    if (missingTables.length > 0) {
      console.log(`\n⚠️  Missing Tables in Supabase (${missingTables.length}):`);
      console.log(missingTables.map((t) => ` - ${t}`).join("\n"));
    }
    if (columnMismatches.length > 0) {
      console.log(`\n⚠️  Missing Columns in Supabase:`);
      const uniqueMismatch = Array.from(new Set(columnMismatches.map((c) => ` - ${c.table}.${c.column}`)));
      console.log(uniqueMismatch.join("\n"));
    }
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    console.log("\n📋 MIGRATION SOLUTION:");
    console.log("1. Open your Supabase Dashboard SQL Editor:");
    console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}/sql`);
    console.log("2. Copy and execute the contents of 'supabase/migrations/20260809_fix_supabase_schema.sql'");
    console.log("3. Re-run this command: npm run migrate:supabase");
  } else {
    console.log("\n✨ All tables and columns are in 100% sync with Supabase production!");
  }
  console.log("==========================================\n");
}

migrate().catch(console.error);
