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

async function normalizeTimestamps() {
  if (!supabase) return;

  const { data: rows, error } = await supabase.from("booking_history").select("id, created_at");
  if (error) {
    console.error("Error fetching booking_history:", error);
    return;
  }

  let updatedCount = 0;
  for (const r of rows) {
    const raw = String(r.created_at || "").trim();
    if (!raw) continue;
    // If not in ISO with Z (e.g. '2026-08-24 11:30:39')
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
      const isoZ = raw.replace(" ", "T") + "Z";
      const { error: updErr } = await supabase.from("booking_history").update({ created_at: isoZ }).eq("id", r.id);
      if (!updErr) updatedCount++;
    }
  }

  console.log(`✅ Normalized ${updatedCount} booking_history rows to UTC ISO timestamps!`);
}

normalizeTimestamps().catch(console.error);
