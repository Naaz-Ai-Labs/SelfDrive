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

async function printFullFleet() {
  const { getVehicles, getVehicleUnits, getBranches } = await import("../src/lib/data");

  const [vehicles, units, branches] = await Promise.all([
    getVehicles({}, true),
    getVehicleUnits(),
    getBranches(),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  console.log("==================== COMPLETE FLEET ROSTER ====================");
  vehicles
    .filter((v) => v.active === 1 && v.status !== "archived")
    .forEach((v) => {
      const vUnits = units.filter((u) => u.vehicle_id === v.id);
      const plates = vUnits.map((u) => `${u.registration_no || u.unit_identifier} (${branchMap.get(u.current_branch_id || 0) || "Unassigned"})`).join(", ");
      console.log(`• [ID ${v.id}] ${v.name} (${v.category_name}) — Total: ${v.total_units} | Avail: ${v.available_units} | Status: ${v.status}`);
      console.log(`   Plates: ${plates || "None assigned"}`);
    });
}

printFullFleet().catch(console.error);
