/* Unit tests for the Razorpay integration.
   Run with: npx tsx scripts/test-razorpay.ts (from the crm directory)

   SCOPE NOTE: this suite previously also asserted webhook idempotency and booking
   fulfilment by writing directly to the local SQLite mirror. That mirror has been
   removed — Supabase is now the single source of truth — so those assertions were
   testing a database that no longer exists and have been deleted rather than left
   to pass vacuously.

   Still to be rewritten against Supabase (tracked, not covered here):
     - payment_events idempotency (duplicate event_id must be skipped once processed)
     - paid_amount is not double-counted when a webhook is replayed
   Both now depend on real database state, so they belong in an integration test
   against a disposable Supabase schema, not in this unit suite. */

import crypto from "node:crypto";
import { verifyRazorpaySignature, verifyRazorpayWebhookSignature } from "../src/lib/razorpay";
import { toPaise, toRupees } from "../src/lib/supabase-sync";

let failures = 0;

function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function runTests() {
  console.log("=== RAZORPAY SIGNATURE & MINOR-UNIT SUITE ===\n");

  check("toPaise converts ₹1,500 to 150,000 paise integer minor units", toPaise(1500) === 150000);
  check("toRupees converts 150,000 paise back to ₹1,500 float", toRupees(150000) === 1500);

  // Test-only values. Never fall back to real credentials in a test harness — an
  // earlier revision hardcoded live-adjacent keys here.
  const testKeySecret = "test_secret_for_signature_math_only";
  const webhookSecret = "test_webhook_secret_for_signature_math_only";

  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  // 1. Payment signature verification
  const orderId = "order_N123456789";
  const paymentId = "pay_P987654321";
  const validSig = crypto.createHmac("sha256", testKeySecret).update(`${orderId}|${paymentId}`).digest("hex");

  check(
    "verifyRazorpaySignature passes with valid HMAC signature",
    verifyRazorpaySignature(orderId, paymentId, validSig) === true
  );

  check(
    "verifyRazorpaySignature fails with tampered signature",
    verifyRazorpaySignature(orderId, paymentId, "invalid_signature_hex") === false
  );

  // 2. Webhook signature verification
  const rawPayload = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
  const validWebhookSig = crypto.createHmac("sha256", webhookSecret).update(rawPayload).digest("hex");

  check(
    "verifyRazorpayWebhookSignature passes with correct secret and payload",
    verifyRazorpayWebhookSignature(rawPayload, validWebhookSig) === true
  );

  check(
    "verifyRazorpayWebhookSignature rejects tampered payload",
    verifyRazorpayWebhookSignature(rawPayload + "tampered", validWebhookSig) === false
  );

  check(
    "verifyRazorpayWebhookSignature rejects an empty signature",
    verifyRazorpayWebhookSignature(rawPayload, "") === false
  );

  console.log(`\n=== RESULTS: ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests().catch((e) => {
  console.error("TEST EXECUTION ERROR:", e);
  process.exit(1);
});
