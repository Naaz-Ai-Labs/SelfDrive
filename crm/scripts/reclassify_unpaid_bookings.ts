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

async function reclassifyUnpaid() {
  if (!supabase) {
    console.log("No supabase client available.");
    return;
  }

  // Find bookings where paid_amount is 0 or null and status is 'Pending verification' without payments
  const res = await supabase
    .from("bookings")
    .update({ status: "Pending payment" })
    .eq("status", "Pending verification")
    .or("paid_amount.is.null,paid_amount.eq.0");

  console.log("Updated unpaid bookings from 'Pending verification' to 'Pending payment':", res.error ? res.error : "success");
}

reclassifyUnpaid().catch(console.error);
