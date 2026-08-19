import "dotenv/config";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || "";

async function testEndpoints() {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // Test standard endpoints
  const endpoints = [
    { path: "rest/v1/", method: "GET" },
    { path: "pg/v1/query", method: "POST", body: JSON.stringify({ query: "SELECT 1" }) },
    { path: "rest/v1/rpc/exec_sql", method: "POST", body: JSON.stringify({ sql: "SELECT 1" }) },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${url}/${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.body,
      });
      const text = await res.text();
      console.log(`Endpoint ${ep.path} status:`, res.status, text.slice(0, 150));
    } catch (e: any) {
      console.log(`Endpoint ${ep.path} error:`, e.message);
    }
  }
}

testEndpoints();
