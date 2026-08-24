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

import { sbSelect, sbInsert, sbUpdate } from "../src/lib/supabase-rest";
import { DEFAULT_VEHICLE_UNITS } from "../src/lib/data";

async function main() {
  console.log("Syncing Supabase vehicle units...");

  // 1. Fetch current vehicle units
  const existingUnitsRes = await sbSelect<any>("vehicle_units", "select=*");
  const existingUnits = existingUnitsRes.data || [];
  const existingMap = new Map<number, any>();
  for (const u of existingUnits) {
    existingMap.set(Number(u.id), u);
  }

  // 2. Upsert / sync all canonical default units (preserving existing status)
  for (const u of DEFAULT_VEHICLE_UNITS) {
    const existing = existingMap.get(u.id);
    const unitPayload = {
      vehicle_id: u.vehicle_id,
      unit_identifier: u.unit_identifier,
      registration_no: existing?.registration_no || u.registration_no,
      status: existing?.status || u.status || "available",
      current_branch_id: existing?.current_branch_id || u.current_branch_id,
      active: existing?.active !== undefined ? existing.active : 1,
      notes: existing?.notes || u.notes,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      console.log(`Updating unit ${u.id} (${u.unit_identifier}) -> Branch ${unitPayload.current_branch_id} status=${unitPayload.status}`);
      await sbUpdate("vehicle_units", `id=eq.${u.id}`, unitPayload);
    } else {
      console.log(`Inserting unit ${u.id} (${u.unit_identifier}) -> Branch ${u.current_branch_id}`);
      await sbInsert("vehicle_units", { id: u.id, ...unitPayload, created_at: new Date().toISOString() });
    }
  }

  // 3. Make sure vehicle master records are active without overwriting manual block/unavailable status
  const masterVehicles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 79, 80];
  for (const vId of masterVehicles) {
    const { data: currentV } = await sbSelect<any>("vehicles", `select=id,status,active&id=eq.${vId}`);
    const existingV = currentV && currentV[0];
    const newStatus = existingV?.status || "available";
    console.log(`Setting vehicle ${vId} status=${newStatus} active=1`);
    await sbUpdate("vehicles", `id=eq.${vId}`, { status: newStatus, active: 1, updated_at: new Date().toISOString() });
  }

  // 4. Update the test bookings with zero payment to 'Pending payment'
  console.log("Updating unpaid test bookings to 'Pending payment'...");
  await sbUpdate("bookings", "booking_no=eq.BK-2026-6VA09VF3C163DE", { status: "Pending payment" });
  await sbUpdate("bookings", "booking_no=eq.BK-2026-6V860M12598E72", { status: "Pending payment" });

  console.log("✓ Fleet and units sync complete!");
}

main().catch(console.error);
