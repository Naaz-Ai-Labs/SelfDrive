import "dotenv/config";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || "";

async function listSwagger() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const data = await res.json();
  const paths = Object.keys(data.paths || {});
  console.log("Available REST paths / RPCs in Supabase:");
  for (const p of paths) {
    if (p.startsWith("/rpc/")) {
      console.log("  RPC:", p);
    }
  }
}

listSwagger();
