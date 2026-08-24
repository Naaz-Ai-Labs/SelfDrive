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

async function purgeUnpaidBookings() {
  if (!supabase) {
    console.log("No supabase client available.");
    return;
  }

  // 1. Fetch all bookings with 0 or null paid amount and status in ('Pending payment', 'Pending verification', 'Draft')
  const { data: unpaidBookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, booking_no, customer_id, status, paid_amount, total_amount")
    .or("paid_amount.is.null,paid_amount.eq.0")
    .in("status", ["Pending payment", "Pending verification", "Draft"]);

  if (bErr) {
    console.error("Error fetching unpaid bookings:", bErr);
    return;
  }

  console.log(`Found ${unpaidBookings?.length || 0} unpaid bookings to purge:`);
  unpaidBookings?.forEach(b => console.log(` - ID: ${b.id}, No: ${b.booking_no}, Status: ${b.status}, Paid: ${b.paid_amount}`));

  if (!unpaidBookings || unpaidBookings.length === 0) {
    console.log("No unpaid bookings found.");
    return;
  }

  const ids = unpaidBookings.map(b => b.id);

  // 2. Clean up associated payments, customer_documents, and booking_history
  await supabase.from("payments").delete().in("booking_id", ids);
  await supabase.from("customer_documents").delete().in("booking_id", ids);
  await supabase.from("booking_history").delete().in("booking_id", ids);

  // 3. Delete unpaid bookings from bookings table
  const { error: delErr } = await supabase.from("bookings").delete().in("id", ids);
  if (delErr) {
    console.error("Error deleting unpaid bookings:", delErr);
  } else {
    console.log(`✅ Successfully purged ${ids.length} unpaid bookings from database.`);
  }
}

purgeUnpaidBookings().catch(console.error);
