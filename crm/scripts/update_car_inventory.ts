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

const supabase = SUPABASE_URL && SUPABASE_SECRET_KEY ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY) : null;
const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = fs.existsSync(DB_PATH) ? new DatabaseSync(DB_PATH) : null;

async function updateCarInventory() {
  console.log("🚗 Updating Car Inventory & Naming...");

  if (sqlite) {
    sqlite.prepare("UPDATE vehicles SET name = 'Maruti Suzuki Baleno', total_units = 2 WHERE name LIKE '%Baleno%'").run();
    sqlite.prepare("UPDATE vehicles SET active = 0 WHERE name LIKE '%Thar%'").run();
    console.log("  ✓ SQLite updated: Baleno renamed to 'Maruti Suzuki Baleno' (2 units), Thar deactivated.");
  }

  if (supabase) {
    await supabase.from("vehicles").update({ name: "Maruti Suzuki Baleno", total_units: 2 }).ilike("name", "%Baleno%");
    await supabase.from("vehicles").update({ active: 0 }).ilike("name", "%Thar%");
    console.log("  ✅ Supabase PostgreSQL updated: Baleno renamed to 'Maruti Suzuki Baleno' (2 units), Thar deactivated.");
  }
}

updateCarInventory().catch(console.error);
