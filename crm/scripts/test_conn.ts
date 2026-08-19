import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function check() {
  console.log("Checking Supabase connection to:", url);
  const { data, error } = await supabase.from("vehicles").select("id, name, slug, total_units").limit(3);
  console.log("Vehicles sample:", { data, error });

  const { data: unitsData, error: unitsError } = await supabase.from("vehicle_units").select("id").limit(1);
  console.log("vehicle_units check:", { unitsData, unitsError });
}

check().catch(console.error);
