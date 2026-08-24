import fs from "fs";
import path from "path";

try {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    } else {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...v] = trimmed.split("=");
        if (k && v.length > 0 && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join("=").trim();
        }
      }
    }
  }
} catch {}

import { sbSelect } from "../src/lib/supabase-rest";

async function main() {
  const cats = await sbSelect("vehicle_categories", "select=*&order=id.asc");
  console.log("Categories in Supabase:", cats.data);

  const res = await sbSelect("vehicles", "select=id,name,slug,category_id,branch_id,status,active,rate_24h,deposit&order=id.asc");
  console.log("\nVehicles in Supabase:");
  for (const v of res.data || []) {
    console.log(`ID: ${v.id} | Name: ${v.name} | category_id: ${v.category_id} | status: ${v.status} | active: ${v.active} | branch_id: ${v.branch_id}`);
  }

  const units = await sbSelect("vehicle_units", "select=id,vehicle_id,registration_no,current_branch_id,status,active&order=vehicle_id.asc");
  console.log(`\nTotal Vehicle Units: ${(units.data || []).length}`);
  for (const u of units.data || []) {
    console.log(`Unit ID: ${u.id} | Vehicle ID: ${u.vehicle_id} | Reg: ${u.registration_no} | Branch: ${u.current_branch_id} | Status: ${u.status} | Active: ${u.active}`);
  }
}

main().catch(console.error);
