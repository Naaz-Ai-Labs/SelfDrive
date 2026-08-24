/**
 * Payment integrity audit.
 *
 * Answers three questions, all read-only:
 *   1. Is the webhook chain actually wired up? (secret present, endpoint registered)
 *   2. Is any money captured at Razorpay missing from Supabase?
 *   3. How many stored timestamps are not canonical ISO-8601 UTC?
 *
 * Run:  npx tsx crm/scripts/audit_payment_integrity.ts
 *
 * Exits non-zero when it finds captured payments with no booking, so it can be wired
 * into CI or a cron check.
 */
import fs from "fs";
import path from "path";

for (const name of [".env.local", ".env"]) {
  const envPath = path.resolve(__dirname, "..", name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (k && v && !process.env[k]) process.env[k] = v;
  }
}

const RZP_ID = process.env.RAZORPAY_KEY_ID!;
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SECRET_KEY!;

const IST = (iso: string | number) =>
  new Date(typeof iso === "number" ? iso * 1000 : iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });

const rzp = (p: string) =>
  fetch(`https://api.razorpay.com/v1${p}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${RZP_ID}:${RZP_SECRET}`).toString("base64") },
  }).then((r) => r.json() as Promise<any>);

const sb = (p: string) =>
  fetch(`${SB_URL}/rest/v1/${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }).then((r) => r.json() as Promise<any>);

const CANONICAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function shapeOf(v: unknown): string {
  const s = String(v ?? "");
  if (!s || s === "null") return "empty";
  if (CANONICAL.test(s)) return "canonical-utc";
  if (/Z$/.test(s)) return "iso-utc (non-ms)";
  if (/[+-]\d{2}:?\d{2}$/.test(s)) return "offset";
  if (/^\d+$/.test(s)) return "epoch-number";
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(s)) return "NAIVE (no zone)";
  return "other";
}

async function main() {
  let problems = 0;

  console.log("\n=== 1. WEBHOOK CHAIN ===");

  // Registration, read from Razorpay itself rather than assumed.
  const hooks = await rzp("/webhooks");
  const live = (hooks.items || []).filter((w: any) => w.active && !w.disabled_at);
  if (live.length === 0) {
    console.log("  FAIL  no active webhook registered at Razorpay.");
    problems++;
  } else {
    for (const w of live) {
      const on = Object.entries(w.events || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      console.log(`  ok    ${w.url}`);
      console.log(`        secret_exists=${w.secret_exists}  events: ${on.join(", ")}`);
      for (const required of ["payment.captured", "order.paid", "payment.failed"]) {
        if (!on.includes(required)) {
          console.log(`  FAIL  event '${required}' is not enabled.`);
          problems++;
        }
      }
      // The handler rejects unsigned requests, so a 400 here proves the route is
      // deployed and verifying. A 404 means the deployment predates the route; a 500
      // means it is deployed but RAZORPAY_WEBHOOK_SECRET is missing from that env.
      try {
        const probe = await fetch(w.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-razorpay-signature": "probe" },
          body: JSON.stringify({ event: "probe" }),
        });
        const label = probe.status === 400 ? "ok   " : "FAIL ";
        if (probe.status !== 400) problems++;
        console.log(`  ${label} endpoint reachable, returned ${probe.status} to an unsigned probe (400 expected)`);
      } catch (e: any) {
        console.log(`  FAIL  endpoint unreachable: ${e?.message}`);
        problems++;
      }
    }
  }

  // Local secret is only meaningful for local runs — production reads Vercel's copy.
  console.log(
    process.env.RAZORPAY_WEBHOOK_SECRET
      ? `  ok    RAZORPAY_WEBHOOK_SECRET present locally (${process.env.RAZORPAY_WEBHOOK_SECRET.length} chars)`
      : "  note  RAZORPAY_WEBHOOK_SECRET absent from local env (fine if it is set in Vercel)"
  );

  const events = await sb("payment_events?select=id,event_type,processed,created_at&order=id.desc&limit=5");
  if (!Array.isArray(events)) {
    console.log("  WARN  could not read payment_events:", JSON.stringify(events).slice(0, 160));
  } else if (events.length === 0) {
    console.log("  FAIL  payment_events is empty — the webhook has never been delivered.");
    problems++;
  } else {
    console.log(`  ok    ${events.length} recent webhook events; latest ${events[0].event_type} @ ${IST(events[0].created_at)} IST`);
  }

  console.log("\n=== 2. RAZORPAY vs SUPABASE ===");
  const payments = await rzp("/payments?count=100");
  const captured = (payments.items || []).filter((p: any) => p.status === "captured");
  console.log(`  ${captured.length} captured payments at Razorpay (last 100)`);

  const orphans: any[] = [];
  const noBooking: any[] = [];

  for (const p of captured) {
    const byId = await sb(`payments?select=id,booking_id,status&razorpay_payment_id=eq.${encodeURIComponent(p.id)}`);
    let row = Array.isArray(byId) && byId[0];
    if (!row && p.order_id) {
      const enc = encodeURIComponent(p.order_id);
      const byOrder = await sb(`payments?select=id,booking_id,status&or=(razorpay_order_id.eq.${enc},gateway_ref.eq.${enc})`);
      row = Array.isArray(byOrder) && byOrder[0];
    }
    if (!row) orphans.push(p);
    else if (!row.booking_id) noBooking.push(p);
  }

  if (orphans.length === 0) {
    console.log("  ok    every captured payment has a Supabase row");
  } else {
    problems++;
    console.log(`  FAIL  ${orphans.length} captured payment(s) MISSING from Supabase entirely:`);
    for (const p of orphans) {
      console.log(
        `          ${IST(p.created_at)} IST  ${p.id}  Rs${p.amount / 100}  ${p.contact ?? ""}  ${p.notes?.Customer ?? ""}`
      );
    }
  }
  if (noBooking.length) {
    problems++;
    console.log(`  FAIL  ${noBooking.length} payment(s) recorded but with no booking attached:`);
    for (const p of noBooking) console.log(`          ${IST(p.created_at)} IST  ${p.id}  Rs${p.amount / 100}`);
  }

  console.log("\n=== 3. TIMESTAMP SHAPES ===");
  for (const [table, col] of [
    ["bookings", "created_at"],
    ["customers", "created_at"],
    ["payments", "paid_at"],
    ["enquiries", "created_at"],
    ["customer_documents", "created_at"],
    ["booking_history", "created_at"],
  ] as const) {
    const rows = await sb(`${table}?select=${col}&limit=200`);
    if (!Array.isArray(rows)) {
      console.log(`  ${table.padEnd(20)} unreadable`);
      continue;
    }
    const counts: Record<string, number> = {};
    for (const r of rows) counts[shapeOf((r as any)[col])] = (counts[shapeOf((r as any)[col])] || 0) + 1;
    const bad = Object.entries(counts).filter(([k]) => k !== "canonical-utc" && k !== "empty");
    if (bad.length) problems++;
    console.log(`  ${table.padEnd(20)} ${JSON.stringify(counts)}${bad.length ? "   <-- non-canonical" : ""}`);
  }

  console.log(`\n=== ${problems === 0 ? "ALL CHECKS PASSED" : `${problems} PROBLEM AREA(S)`} ===\n`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
