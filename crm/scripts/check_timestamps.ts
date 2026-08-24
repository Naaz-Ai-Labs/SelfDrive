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

async function checkTimestamps() {
  if (!supabase) return;

  const { data: latestBookings } = await supabase
    .from("bookings")
    .select("id, booking_no, created_at, updated_at")
    .order("id", { ascending: false })
    .limit(5);

  console.log("Latest bookings:", latestBookings);

  if (latestBookings && latestBookings.length > 0) {
    const bId = latestBookings[0].id;
    const { data: history } = await supabase
      .from("booking_history")
      .select("*")
      .eq("booking_id", bId)
      .order("created_at", { ascending: false });

    console.log(`\nHistory for booking #${bId} (${latestBookings[0].booking_no}):`);
    history?.forEach((h) => {
      console.log(`- ID ${h.id} | Action: ${h.action} | created_at raw: "${h.created_at}"`);
    });
  }

  const { data: logs } = await supabase
    .from("activity_logs")
    .select("*")
    .order("id", { ascending: false })
    .limit(10);

  console.log("\nLatest activity logs:");
  logs?.forEach((l) => {
    console.log(`- ID ${l.id} | Action: ${l.action} | created_at raw: "${l.created_at}"`);
  });
}

checkTimestamps().catch(console.error);
