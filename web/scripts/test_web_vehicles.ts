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

async function testWebVehicles() {
  const { getVehicles } = await import("../src/lib/data");

  const list = await getVehicles();
  console.log("=== GET VEHICLES (WEB) ===");
  list.forEach((v) => {
    console.log(`[${v.id}] ${v.name} (${v.slug}): status="${v.status}", total=${v.total_units}, avail=${v.available_units}`);
  });
}

testWebVehicles().catch(console.error);
