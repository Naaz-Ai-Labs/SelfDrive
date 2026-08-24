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

async function testFormat() {
  const { formatDateTime } = await import("../src/lib/utils");
  const { parseIstInstant } = await import("../src/lib/rental-clock");

  console.log("=== TIMESTAMP FORMAT TEST ===");
  console.log("1. '2026-08-24T07:54:51.245Z' ->", formatDateTime("2026-08-24T07:54:51.245Z"));
  console.log("2. '2026-08-24 11:30:39' ->", formatDateTime("2026-08-24 11:30:39"));
  console.log("3. '2026-08-24T11:30:39' ->", formatDateTime("2026-08-24T11:30:39"));
  console.log("4. User schedule '2026-08-28T11:00' ->", formatDateTime("2026-08-28T11:00"));
  console.log("5. User schedule '2026-08-28 08:00' ->", formatDateTime("2026-08-28 08:00"));
}

testFormat().catch(console.error);
