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

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = new DatabaseSync(DB_PATH);

async function audit() {
  const tables = (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((r) => r.name);

  console.log(`Found ${tables.length} tables in SQLite. Testing Supabase schemas...\n`);

  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${table} LIMIT 1`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`ℹ️  [${table}]: 0 rows in SQLite, skipping upsert test.`);
      continue;
    }
    const sampleRow = rows[0];
    const { error } = await supabase.from(table).upsert([sampleRow]);
    if (error) {
      console.error(`❌ [${table}]: ${error.message} (Code: ${error.code})`);
    } else {
      console.log(`✅ [${table}]: OK`);
    }
  }
}

audit().catch(console.error);
