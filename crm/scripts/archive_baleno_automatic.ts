import { createClient } from "@supabase/supabase-js";
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

async function archiveBalenoAutomatic() {
  if (!supabase) return;

  console.log("Archiving Ballono automatic (vehicle 78)...");
  const { error: vErr } = await supabase
    .from("vehicles")
    .update({ active: 0, status: "archived", updated_at: new Date().toISOString() })
    .eq("id", 78);
  if (vErr) console.error("Error archiving vehicle 78:", vErr);
  else console.log("✓ Vehicle 78 archived successfully");

  const { error: uErr } = await supabase
    .from("vehicle_units")
    .update({ active: 0, status: "inactive", updated_at: new Date().toISOString() })
    .eq("vehicle_id", 78);
  if (uErr) console.error("Error archiving vehicle_units for 78:", uErr);
  else console.log("✓ Units for vehicle 78 deactivated");
}

archiveBalenoAutomatic().catch(console.error);
