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

async function checkFleet() {
  if (!supabase) return;

  const { data: vehicles } = await supabase.from("vehicles").select("*").eq("active", 1).order("id");
  const { data: units } = await supabase.from("vehicle_units").select("*").order("id");

  console.log("=== ACTIVE VEHICLES IN SUPABASE ===");
  vehicles?.forEach((v) => {
    const vUnits = units?.filter((u) => u.vehicle_id === v.id) || [];
    const availUnits = vUnits.filter((u) => u.status === "available" && u.active === 1);
    const unavailUnits = vUnits.filter((u) => u.status === "unavailable" || u.status === "blocked");
    console.log(
      `ID: ${v.id} | ${v.name} (${v.slug}) | Status: ${v.status} | Total: ${v.total_units} | Units in DB: ${vUnits.length} (Avail: ${availUnits.length}, Unavail: ${unavailUnits.length})`
    );
  });
}

checkFleet().catch(console.error);
