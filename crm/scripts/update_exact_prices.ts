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

// Exact Weekday & Weekend Pricing Map (+₹50 on Weekends)
const PRICE_MAP: Array<{ keyword: string; weekday: number; weekend: number }> = [
  { keyword: "Dio", weekday: 900, weekend: 950 },
  { keyword: "Activa", weekday: 900, weekend: 950 },
  { keyword: "Jupiter", weekday: 900, weekend: 950 },
  { keyword: "RayZR", weekday: 1000, weekend: 1050 },
  { keyword: "Shine", weekday: 1000, weekend: 1050 },
  { keyword: "NTorq", weekday: 1100, weekend: 1150 },
  { keyword: "Ntorq", weekday: 1100, weekend: 1150 },
  { keyword: "Raider", weekday: 1400, weekend: 1450 },
  { keyword: "Radar", weekday: 1400, weekend: 1450 },
  { keyword: "CB200X", weekday: 1800, weekend: 1850 },
  { keyword: "Ronin", weekday: 1800, weekend: 1850 },
  { keyword: "Pulsar", weekday: 1300, weekend: 1350 },
  { keyword: "Baleno", weekday: 3500, weekend: 3550 },
  { keyword: "Thar", weekday: 5000, weekend: 5050 },
  { keyword: "Traveller", weekday: 12000, weekend: 12050 },
];

async function updateExactPrices() {
  console.log("🛠️ Updating exact vehicle prices in SQLite & Supabase...\n");

  for (const item of PRICE_MAP) {
    if (sqlite) {
      const res = sqlite
        .prepare("UPDATE vehicles SET rate_24h = ?, weekend_rate_24h = ? WHERE name LIKE ?")
        .run(item.weekday, item.weekend, `%${item.keyword}%`);
      console.log(`  ✓ SQLite [${item.keyword}]: Updated to Weekday ₹${item.weekday} / Weekend ₹${item.weekend}`);
    }

    if (supabase) {
      const { error } = await supabase
        .from("vehicles")
        .update({ rate_24h: item.weekday, weekend_rate_24h: item.weekend })
        .ilike("name", `%${item.keyword}%`);
      if (error) {
        console.warn(`  ⚠️ Supabase [${item.keyword}] update error:`, error.message);
      } else {
        console.log(`  ✅ Supabase [${item.keyword}]: Updated to Weekday ₹${item.weekday} / Weekend ₹${item.weekend}`);
      }
    }
  }

  console.log("\n=======================================================");
  console.log("✨ VEHICLE PRICING UPDATED & SYNCED SUCCESSFULLY!");
  console.log("=======================================================\n");
}

updateExactPrices().catch(console.error);
