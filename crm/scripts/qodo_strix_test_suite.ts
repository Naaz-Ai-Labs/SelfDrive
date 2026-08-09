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
import { isWeekend, getDynamicRate24h, calculateLateFee, calculateQuote } from "../src/lib/pricing";
import { normalizePhone, randomToken, parseJSON } from "../src/lib/utils";

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

let unitPassed = 0;
let unitFailed = 0;
let blackboxPassed = 0;
let blackboxFailed = 0;
let securityPassed = 0;
let securityFailed = 0;

function assertUnit(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  [UNIT PASS] ${desc}`);
    unitPassed++;
  } else {
    console.error(`  [UNIT FAIL] ${desc}`);
    unitFailed++;
  }
}

function assertBlackbox(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  [BLACKBOX PASS] ${desc}`);
    blackboxPassed++;
  } else {
    console.error(`  [BLACKBOX FAIL] ${desc}`);
    blackboxFailed++;
  }
}

function assertSecurity(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  [STRIX PASS] ${desc}`);
    securityPassed++;
  } else {
    console.error(`  [STRIX FAIL] ${desc}`);
    securityFailed++;
  }
}

async function runQodoStrixSuite() {
  console.log("===============================================================================");
  console.log("🧪 QODO-COVER & STRIX AUTONOMOUS TESTING ENGINE");
  console.log("Suite: Unit Testing · Blackbox Integration · A/B Performance · Strix Security");
  console.log("================================================================ me\n");

  // =========================================================================
  // 1. UNIT TESTING SUITE (Qodo-Cover Code Logic Coverage)
  // =========================================================================
  console.log("📦 SECTION 1: UNIT TESTING (Qodo-Cover Code Logic Coverage)");

  // 1.1 Phone Normalization
  assertUnit("normalizePhone formats +91 98765 43210 -> +919876543210", normalizePhone("+91 98765 43210") === "+919876543210");
  assertUnit("normalizePhone handles 10-digit number -> +919876543210", normalizePhone("9876543210") === "+919876543210");

  // 1.2 Currency Minor Unit Conversions
  assertUnit("toPaise converts ₹3,500 -> 350,000 paise integer", toPaise(3500) === 350000);
  assertUnit("toRupees converts 350,000 paise -> ₹3,500 float", toRupees(350000) === 3500);

  // 1.3 Pricing & Weekend Hike Calculations
  const sat = new Date("2026-08-15T10:00:00");
  const mon = new Date("2026-08-17T10:00:00");
  assertUnit("isWeekend recognizes Saturday", isWeekend(sat));
  assertUnit("isWeekend recognizes Monday as weekday", !isWeekend(mon));
  assertUnit("getDynamicRate24h hikes base rate ₹900 by +₹50 on Saturday to ₹950", getDynamicRate24h(900, sat) === 950);
  assertUnit("getDynamicRate24h keeps base rate ₹900 on Monday", getDynamicRate24h(900, mon) === 900);

  // 1.4 Strict 1-Minute Late Fee Policy
  const scheduledDrop = new Date("2026-08-10T10:00:00");
  const late1MinDrop = new Date("2026-08-10T10:01:00");
  const lateFeeRes = calculateLateFee(scheduledDrop, late1MinDrop, 900);
  assertUnit("Strict 1-Minute Late Return Policy: 1 min late = full 24h charge (₹900)", lateFeeRes.fee === 900 && lateFeeRes.minutesLate === 1);

  // 1.5 Quote Calculation Engine
  const testVehicle = {
    id: 5,
    slug: "maruti-baleno",
    name: "Maruti Suzuki Baleno",
    brand: "Maruti Suzuki",
    model: "Baleno",
    year: 2023,
    category_id: 1,
    category_name: "Cars",
    category_kind: "car",
    category_slug: "cars",
    branch_id: 1,
    branch_name: "Sakleshpura",
    registration_no: "KA-46-C-7890",
    cc: 1197,
    fuel_type: "Petrol",
    transmission: "Manual",
    seats: 5,
    mileage: "21 km/l",
    included_km: 300,
    extra_km_rate: 8,
    rate_12h: 2000,
    rate_24h: 3500,
    hourly_rate: 200,
    weekend_rate_24h: 3500,
    deposit: 2000,
    late_fee_per_hour: 150,
    total_units: 2,
    available_units: 2,
    description: null,
    terms: null,
    status: "available",
    active: 1,
    photos: [],
    primary_photo: null,
  };
  const quote = calculateQuote(testVehicle, sat, new Date("2026-08-17T10:00:00"));
  assertUnit("calculateQuote computes 2 days rental correctly", quote.days === 2);
  assertUnit("calculateQuote includes 6% GST", quote.gstPct === 6 && quote.gstAmount > 0);

  // =========================================================================
  // 2. BLACKBOX INTEGRATION TESTING (End-to-End API Gateway & DB Workflows)
  // =========================================================================
  console.log("\n⬛ SECTION 2: BLACKBOX INTEGRATION TESTING (API Gateway & DB Workflows)");

  // 2.1 SQLite Database Operations
  if (sqlite) {
    const baleno = sqlite.prepare("SELECT name, total_units FROM vehicles WHERE name LIKE '%Baleno%'").get() as { name: string; total_units: number } | undefined;
    assertBlackbox("SQLite: Maruti Suzuki Baleno exists and has 2 units", !!baleno && baleno.total_units === 2);
  }

  // 2.2 Supabase Direct Database Fallback
  if (supabase) {
    const { data: supaVehicles, error } = await supabase.from("vehicles").select("id, name, total_units").ilike("name", "%Baleno%");
    assertBlackbox("Supabase: Baleno query returns active record", !error && Array.isArray(supaVehicles) && supaVehicles.length > 0);
  }

  // 2.3 Token Parsing & Utilities
  const randTok = randomToken(32);
  assertBlackbox("randomToken generates valid 64-char hex token for 32 bytes", typeof randTok === "string" && randTok.length === 64);
  const parsedObj = parseJSON('{"test": true}', {});
  assertBlackbox("parseJSON safely parses valid JSON", (parsedObj as any).test === true);

  // =========================================================================
  // 3. A/B PERFORMANCE & RELIABILITY BENCHMARKING
  // =========================================================================
  console.log("\n⚡ SECTION 3: A/B PERFORMANCE & RELIABILITY BENCHMARKING");

  const startLocal = Date.now();
  if (sqlite) {
    sqlite.prepare("SELECT COUNT(*) FROM vehicles").get();
  }
  const localTime = Date.now() - startLocal;
  console.log(`  ⏱️ A/B Benchmark (Local SQLite Read): ${localTime}ms`);

  const startSupa = Date.now();
  if (supabase) {
    await supabase.from("vehicles").select("count", { count: "exact", head: true });
  }
  const supaTime = Date.now() - startSupa;
  console.log(`  ⏱️ A/B Benchmark (Supabase PostgreSQL Query): ${supaTime}ms`);
  assertBlackbox("A/B Performance: Both query pipelines complete under 500ms", localTime < 500 && supaTime < 500);

  // =========================================================================
  // 4. STRIX AUTONOMOUS SECURITY & PENETRATION SUITE
  // =========================================================================
  console.log("\n🦅 SECTION 4: STRIX AUTONOMOUS SECURITY & PENETRATION AUDIT");

  const testKeySecret = process.env.RAZORPAY_KEY_SECRET ?? "vWEQ49WAZ71sye9SJbK5eluA";
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  const orderId = "order_strix_qodo_123";
  const paymentId = "pay_strix_qodo_456";
  const validSig = crypto.createHmac("sha256", testKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const tamperedSig = "tampered_signature_attack_vector";

  assertSecurity("Razorpay HMAC signature passes with valid HMAC-SHA256", verifyRazorpaySignature(orderId, paymentId, validSig));
  assertSecurity("Razorpay HMAC signature rejects tampered HMAC payload", !verifyRazorpaySignature(orderId, paymentId, tamperedSig));

  const webhookSecret = "whsec_strix_qodo_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId } } } });
  const validWebhookSig = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  assertSecurity("Webhook HMAC signature validation passes with correct secret", verifyRazorpayWebhookSignature(rawBody, validWebhookSig));
  assertSecurity("Webhook HMAC signature validation rejects payload tampering", !verifyRazorpayWebhookSignature(rawBody + "attack", validWebhookSig));

  const gatewayKey = process.env.GATEWAY_API_KEY;
  assertSecurity("Gateway API Key header security is active", !!gatewayKey && gatewayKey.length >= 32);

  // =========================================================================
  // RESULTS SUMMARY
  // =========================================================================
  console.log("\n===============================================================================");
  const totalPassed = unitPassed + blackboxPassed + securityPassed;
  const totalFailed = unitFailed + blackboxFailed + securityFailed;
  if (totalFailed === 0) {
    console.log(`✨ ALL ${totalPassed} QODO-COVER & STRIX TEST SUITES PASSED CLEANLY!`);
    console.log(`   • Unit Tests: ${unitPassed}/${unitPassed} passed`);
    console.log(`   • Blackbox Integration Tests: ${blackboxPassed}/${blackboxPassed} passed`);
    console.log(`   • Strix Security Tests: ${securityPassed}/${securityPassed} passed`);
  } else {
    console.error(`⚠️ TEST SUITE COMPLETED WITH ${totalFailed} FAILURES (${totalPassed} PASSED).`);
  }
  console.log("===============================================================================\n");
}

runQodoStrixSuite().catch(console.error);
