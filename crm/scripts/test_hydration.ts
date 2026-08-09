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
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

async function testHydration() {
  const startTime = Date.now();
  console.log("Starting hydration benchmark from Supabase...");

  const tables = [
    "branches",
    "vehicle_categories",
    "vehicles",
    "vehicle_photos",
    "pricing_rules",
    "availability_blocks",
    "terms_versions",
    "enquiries",
    "enquiry_history",
    "bookings",
    "booking_history",
    "customer_documents",
    "inspections",
    "inspection_photos",
    "damage_reports",
    "manual_adjustments",
    "payments",
    "refunds",
    "invoices",
    "problem_tickets",
    "maintenance_records",
    "tasks",
    "messages",
    "message_templates",
    "notifications",
    "documents",
    "feedback",
    "testimonials",
    "gallery",
    "blog_posts",
    "faqs",
    "otp_codes",
    "customer_sessions",
    "activity_logs",
    "settings",
    "users",
  ];

  let totalRows = 0;
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*");
    if (!error && data) {
      totalRows += data.length;
      console.log(`Pulled ${data.length} rows for table [${table}]`);
    } else if (error) {
      console.warn(`Error pulling [${table}]:`, error.message);
    }
  }

  console.log(`\n Hydrated ${totalRows} total records in ${Date.now() - startTime} ms`);
}

testHydration().catch(console.error);
