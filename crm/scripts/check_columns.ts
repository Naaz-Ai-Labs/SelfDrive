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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = new DatabaseSync(DB_PATH);

async function checkColumns() {
  const tables = (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((r) => r.name);

  console.log("=== DETAILED COLUMN DIFFERENCE CHECK ===\n");

  for (const table of tables) {
    // Get SQLite column names
    const pragma = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const sqliteCols = pragma.map((p) => p.name);

    // Try fetching 1 record or schema from Supabase
    const { data, error } = await supabase.from(table).select("*").limit(1);

    if (error) {
      console.log(`❌ Table [${table}]: Error fetching from Supabase -> ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      const supabaseCols = Object.keys(data[0]);
      const missingInSupabase = sqliteCols.filter((c) => !supabaseCols.includes(c));
      const extraInSupabase = supabaseCols.filter((c) => !sqliteCols.includes(c));

      if (missingInSupabase.length > 0 || extraInSupabase.length > 0) {
        console.log(`⚠️ Table [${table}] Column Mismatch:`);
        if (missingInSupabase.length > 0) console.log(`   Missing in Supabase: ${missingInSupabase.join(", ")}`);
        if (extraInSupabase.length > 0) console.log(`   Extra in Supabase: ${extraInSupabase.join(", ")}`);
      } else {
        console.log(`✅ Table [${table}]: Columns match perfectly (${sqliteCols.length} cols).`);
      }
    } else {
      // If table is empty, test individual columns by selecting them
      const missingCols: string[] = [];
      for (const col of sqliteCols) {
        const { error: colErr } = await supabase.from(table).select(col).limit(1);
        if (colErr) {
          missingCols.push(col);
        }
      }
      if (missingCols.length > 0) {
        console.log(`⚠️ Table [${table}] (Empty in Supabase) Missing columns: ${missingCols.join(", ")}`);
      } else {
        console.log(`✅ Table [${table}] (Empty in Supabase): All ${sqliteCols.length} columns exist.`);
      }
    }
  }
}

checkColumns().catch(console.error);
