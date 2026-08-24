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

async function inspectFleet() {
  if (!supabase) {
    console.log("No supabase client available.");
    return;
  }

  console.log("=== SUPABASE VEHICLES ===");
  const { data: vehicles, error: vErr } = await supabase
    .from("vehicles")
    .select("id, slug, name, status, active, total_units, branch_id")
    .order("id");
  if (vErr) console.error("Error fetching vehicles:", vErr);
  else {
    vehicles?.forEach((v) => {
      console.log(`Vehicle ${v.id} [${v.slug}]: name="${v.name}", status="${v.status}", active=${v.active}, total_units=${v.total_units}, branch_id=${v.branch_id}`);
    });
  }

  console.log("\n=== SUPABASE VEHICLE UNITS ===");
  const { data: units, error: uErr } = await supabase
    .from("vehicle_units")
    .select("id, vehicle_id, unit_identifier, registration_no, status, active, current_branch_id")
    .order("id");
  if (uErr) console.error("Error fetching vehicle units:", uErr);
  else {
    console.log(`Total units in DB: ${units?.length || 0}`);
    units?.forEach((u) => {
      console.log(`Unit ${u.id}: vehicle_id=${u.vehicle_id}, reg="${u.registration_no}", status="${u.status}", active=${u.active}, branch=${u.current_branch_id}`);
    });
  }

  console.log("\n=== ACTIVE BOOKINGS / HOLDS ===");
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, booking_no, vehicle_id, vehicle_unit_id, branch_id, status, pickup_at, return_at")
    .not("status", "in", '("Cancelled","Completed","Rejected")');
  if (bErr) console.error("Error fetching bookings:", bErr);
  else {
    console.log(`Active bookings: ${bookings?.length || 0}`);
    bookings?.forEach((b) => {
      console.log(`Booking ${b.id} (${b.booking_no}): vehicle=${b.vehicle_id}, unit=${b.vehicle_unit_id}, branch=${b.branch_id}, status=${b.status}, return=${b.return_at}`);
    });
  }
}

inspectFleet().catch(console.error);
