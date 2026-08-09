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

const LIVE_KEY_ID = "rzp_live_TMtWnWetF4mEf8";
const LIVE_KEY_SECRET = "vWEQ49WAZ71sye9SJbK5eluA";

async function updateLiveRazorpaySettings() {
  console.log("🛠️ Updating Razorpay Live credentials in SQLite & Supabase settings...\n");

  const settingsToUpdate = [
    { key: "razorpay_key_id", value: LIVE_KEY_ID },
    { key: "razorpay_key_secret", value: LIVE_KEY_SECRET },
  ];

  for (const s of settingsToUpdate) {
    if (sqlite) {
      sqlite
        .prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
        .run(s.key, s.value);
      console.log(`  ✓ SQLite setting updated: ${s.key} = ${s.value.slice(0, 10)}...`);
    }

    if (supabase) {
      const { error } = await supabase.from("settings").upsert({ key: s.key, value: s.value, updated_at: new Date().toISOString() });
      if (error) {
        console.warn(`  ⚠️ Supabase setting update warning [${s.key}]:`, error.message);
      } else {
        console.log(`  ✅ Supabase setting updated: ${s.key} = ${s.value.slice(0, 10)}...`);
      }
    }
  }

  console.log("\n=======================================================");
  console.log("✨ RAZORPAY LIVE PRODUCTION KEYS SYNCED SUCCESSFULLY!");
  console.log("=======================================================\n");
}

updateLiveRazorpaySettings().catch(console.error);
