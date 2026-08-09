import { createClient } from "@supabase/supabase-js";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  toPaise,
  toRupees,
} from "../src/lib/supabase-sync";
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "../src/lib/razorpay";
import { isWeekend, getDynamicRate24h, calculateLateFee } from "../src/lib/pricing";

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
const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = fs.existsSync(DB_PATH) ? new DatabaseSync(DB_PATH) : null;

let totalPassed = 0;
let totalFailed = 0;

function testAssert(description: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    totalPassed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    totalFailed++;
  }
}

async function runStrixAudit() {
  console.log("===============================================================================");
  console.log("🦅 STRIX AUTONOMOUS SECURITY & FUNCTIONAL AUDIT SUITE");
  console.log("Target: Darshh Holiday Web & CRM Architecture");
  console.log("===============================================================================\n");

  // 1. FINANCIAL LEDGER & RAZORPAY INTEGRITY
  console.log("🔒 1. Financial Ledger & Razorpay Security Suite:");

  testAssert("Minor unit conversion (toPaise ₹950 -> 95000 paise)", toPaise(950) === 95000);
  testAssert("Minor unit conversion (toRupees 95000 paise -> ₹950)", toRupees(95000) === 950);

  const testKeySecret = process.env.RAZORPAY_KEY_SECRET ?? "vWEQ49WAZ71sye9SJbK5eluA";
  const orderId = "order_strix_test_12345";
  const paymentId = "pay_strix_test_67890";
  const validSig = crypto.createHmac("sha256", testKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const invalidSig = "tampered_signature_12345";

  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  testAssert("Razorpay HMAC signature verification passes with valid signature", verifyRazorpaySignature(orderId, paymentId, validSig));
  testAssert("Razorpay HMAC signature verification rejects tampered signature", !verifyRazorpaySignature(orderId, paymentId, invalidSig));

  const webhookSecret = "whsec_strix_secret_test";
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId } } } });
  const validWebhookSig = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  testAssert("Razorpay Webhook signature verification passes with valid signature", verifyRazorpayWebhookSignature(rawBody, validWebhookSig));
  testAssert("Razorpay Webhook signature rejects tampered body", !verifyRazorpayWebhookSignature(rawBody + "tamper", validWebhookSig));

  // 2. DYNAMIC PRICING & LATE RETURN POLICY
  console.log("\n📈 2. Dynamic Weekend Pricing & Late Return Policy:");

  const saturday = new Date("2026-08-15T10:00:00"); // Saturday
  const monday = new Date("2026-08-17T10:00:00");   // Monday

  testAssert("isWeekend detects Saturday correctly", isWeekend(saturday));
  testAssert("isWeekend detects Monday as weekday", !isWeekend(monday));

  testAssert("getDynamicRate24h hikes ₹900 by +₹50 on Saturday to ₹950", getDynamicRate24h(900, saturday) === 950);
  testAssert("getDynamicRate24h keeps ₹900 base rate on Monday", getDynamicRate24h(900, monday) === 900);

  const scheduled = new Date("2026-08-10T10:00:00");
  const actualLate1Min = new Date("2026-08-10T10:01:00"); // 1 min late
  const lateCalc = calculateLateFee(scheduled, actualLate1Min, 900);

  testAssert("Strict Late Return Policy: 1 minute late bills full 24h day charge (₹900)", lateCalc.fee === 900 && lateCalc.minutesLate === 1);

  // 3. DATABASE INTEGRITY & VEHICLE STOCK
  console.log("\n🗄️ 3. Database Integrity & Stock Audit:");

  if (sqlite) {
    const baleno = sqlite.prepare("SELECT name, total_units FROM vehicles WHERE name LIKE '%Baleno%'").get() as { name: string; total_units: number } | undefined;
    testAssert("Maruti Suzuki Baleno exists in SQLite database", !!baleno);
    if (baleno) {
      testAssert("Maruti Suzuki Baleno total units equals 2", baleno.total_units === 2);
    }

    const totalVehicles = sqlite.prepare("SELECT COUNT(*) AS c FROM vehicles").get() as { c: number };
    testAssert("SQLite database has active vehicle records", totalVehicles.c > 0);
  }

  if (supabase) {
    const { data: supaVehicles, error } = await supabase.from("vehicles").select("id, name, total_units").ilike("name", "%Baleno%");
    testAssert("Supabase PostgreSQL connection active and query succeeds", !error && Array.isArray(supaVehicles));
    if (supaVehicles && supaVehicles.length > 0) {
      testAssert("Supabase Baleno total units synced to 2", supaVehicles[0].total_units === 2);
    }
  }

  // 4. SECURITY & API GATEWAY CHECKS
  console.log("\n🛡️ 4. Security & API Gateway Authorization Audit:");

  const gatewayKey = process.env.GATEWAY_API_KEY;
  testAssert("GATEWAY_API_KEY is configured for secure internal route proxying", !!gatewayKey && gatewayKey.length >= 32);

  console.log("\n===============================================================================");
  if (totalFailed === 0) {
    console.log(`✨ AUDIT SUCCESSFUL: ALL ${totalPassed} STRIX SECURITY & FUNCTIONAL CHECKS PASSED!`);
  } else {
    console.error(`⚠️ AUDIT COMPLETED WITH ${totalFailed} FAILURES (${totalPassed} PASSED).`);
  }
  console.log("===============================================================================\n");
}

runStrixAudit().catch(console.error);
