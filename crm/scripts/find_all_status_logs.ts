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

async function findAllStatusLogs() {
  if (!supabase) return;

  const { data: logs, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total logs: ${logs.length}`);
  logs.forEach((l) => {
    console.log(`ID: ${l.id} | Date: ${l.created_at} | Action: ${l.action} | Entity: ${l.entity_type} #${l.entity_id} | Details:`, JSON.stringify(l.details));
  });
}

findAllStatusLogs().catch(console.error);
