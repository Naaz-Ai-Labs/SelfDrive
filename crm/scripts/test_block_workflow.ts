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

async function testDirectWorkflow() {
  const { sbUpdate } = await import("../src/lib/supabase-rest");
  const { getVehicles } = await import("../src/lib/data");
  const { invalidateContentCaches } = await import("../src/lib/actions");

  console.log("1. Blocking Thar (id: 16) in Supabase...");
  await sbUpdate("vehicles", "id=eq.16", { status: "unavailable" });
  await sbUpdate("vehicle_units", "vehicle_id=eq.16", { status: "unavailable" });
  await invalidateContentCaches();

  const listAfterBlock = await getVehicles({}, true);
  const tharAfterBlock = listAfterBlock.find((v) => v.id === 16);
  console.log(`Thar after block: status="${tharAfterBlock?.status}", avail=${tharAfterBlock?.available_units}`);

  console.log("2. Unblocking Thar (id: 16) in Supabase...");
  await sbUpdate("vehicles", "id=eq.16", { status: "available" });
  await sbUpdate("vehicle_units", "vehicle_id=eq.16", { status: "available" });
  await invalidateContentCaches();

  const listAfterUnblock = await getVehicles({}, true);
  const tharAfterUnblock = listAfterUnblock.find((v) => v.id === 16);
  console.log(`Thar after unblock: status="${tharAfterUnblock?.status}", avail=${tharAfterUnblock?.available_units}`);
}

testDirectWorkflow().catch(console.error);
