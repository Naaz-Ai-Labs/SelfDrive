/* Unit & Integration Tests for Production Razorpay Payment Integration.
   Run with: npx tsx scripts/test-razorpay.ts (from crm directory) */

import crypto from "node:crypto";
import { getDb } from "../src/lib/db";
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  createRazorpayOrder,
  issueRazorpayRefund,
} from "../src/lib/razorpay";
import { createBookingPaymentOrder, verifyBookingPayment } from "../src/lib/payment-actions";

let failures = 0;

function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function runTests() {
  console.log("=== RAZORPAY INTEGRATION SUITE ===\n");

  const testKeyId = process.env.RAZORPAY_KEY_ID ?? "rzp_test_TNGC5KHCkEBPbQ";
  const testKeySecret = process.env.RAZORPAY_KEY_SECRET ?? "yQmb3HXRIWxnmKmVP93hufsY";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "whsec_test_secret_123456";

  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  // 1. Signature Verification Tests
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

  // 2. Webhook Signature Verification Tests
  const rawPayload = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  const validWebhookSig = crypto.createHmac("sha256", webhookSecret).update(rawPayload).digest("hex");

  check(
    "verifyRazorpayWebhookSignature passes with correct secret and payload",
    verifyRazorpayWebhookSignature(rawPayload, validWebhookSig) === true
  );

  check(
    "verifyRazorpayWebhookSignature rejects tampered payload",
    verifyRazorpayWebhookSignature(rawPayload + "tampered", validWebhookSig) === false
  );

  // 3. Database Idempotency & Booking Fulfillment Tests
  const db = getDb();
  
  // Cleanup test fixtures
  db.prepare("DELETE FROM payments WHERE notes LIKE '%Test Suite%'").run();
  db.prepare("DELETE FROM availability_blocks WHERE notes = 'test_booking_rzp'").run();
  db.prepare("DELETE FROM booking_history WHERE detail LIKE '%Test Suite%'").run();
  db.prepare("DELETE FROM bookings WHERE notes = 'test_booking_rzp'").run();
  db.prepare("DELETE FROM customers WHERE email = 'rzp.test@example.com'").run();

  // Seed customer & booking
  const customerRes = db.prepare(
    "INSERT INTO customers (name, phone, email, source) VALUES ('Razorpay Test User', '+919999900000', 'rzp.test@example.com', 'Test Suite')"
  ).run();
  const customerId = Number(customerRes.lastInsertRowid);

  const vehicle = db.prepare("SELECT id FROM vehicles WHERE active = 1 LIMIT 1").get() as { id: number };
  const bookingNo = `BK-TST-${Date.now().toString(36)}`;
  
  const bookingRes = db.prepare(
    `INSERT INTO bookings (
      booking_no, customer_id, vehicle_id, pickup_at, return_at, status, base_amount, total_amount, paid_amount, notes
    ) VALUES (?, ?, ?, datetime('now', '+1 day'), datetime('now', '+2 days'), 'Pending verification', 1500, 1500, 0, 'test_booking_rzp')`
  ).run(bookingNo, customerId, vehicle.id);
  const bookingId = Number(bookingRes.lastInsertRowid);

  // Test createBookingPaymentOrder (authoritative amount calculated from DB)
  const orderRes = await createBookingPaymentOrder(bookingId);
  check(
    "createBookingPaymentOrder returns orderId and correct amountPaise",
    orderRes.ok === true && orderRes.amountPaise === 150000,
    orderRes.ok ? `orderId=${orderRes.orderId}` : `error=${orderRes.error}`
  );

  if (orderRes.ok) {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(orderRes.paymentId) as { status: string; amount: number; gateway_ref: string };
    check("Payment record created in Pending status with gateway_ref", payment && payment.status === "Pending" && payment.gateway_ref === orderRes.orderId);

    // Test verifyBookingPayment (Fulfill Payment)
    const verifyRes = await verifyBookingPayment({
      paymentId: orderRes.paymentId,
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
      skipSignatureCheck: true,
    });

    check("verifyBookingPayment succeeds", verifyRes.ok === true && verifyRes.bookingNo === bookingNo);

    const updatedBooking = db.prepare("SELECT status, paid_amount FROM bookings WHERE id = ?").get(bookingId) as { status: string; paid_amount: number };
    check("Booking status auto-confirms and paid_amount updates", updatedBooking.status === "Confirmed" && updatedBooking.paid_amount === 1500);

    const updatedPayment = db.prepare("SELECT status, receipt_no FROM payments WHERE id = ?").get(orderRes.paymentId) as { status: string; receipt_no: string };
    check("Payment status updates to Paid and receipt_no generated", updatedPayment.status === "Paid" && updatedPayment.receipt_no.startsWith("RC"));

    // 4. Idempotency Test (Re-verifying same payment must be safe and return success without double charging)
    const reVerifyRes = await verifyBookingPayment({
      paymentId: orderRes.paymentId,
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
      skipSignatureCheck: true,
    });
    check("Idempotent re-verification succeeds without error", reVerifyRes.ok === true && reVerifyRes.bookingNo === bookingNo);
    
    const doubleBookingCheck = db.prepare("SELECT paid_amount FROM bookings WHERE id = ?").get(bookingId) as { paid_amount: number };
    check("Booking paid_amount is NOT double-counted on re-verification", doubleBookingCheck.paid_amount === 1500);
  }

  // Cleanup test fixtures
  db.prepare("DELETE FROM payments WHERE booking_id = ?").run(bookingId);
  db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
  db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);

  console.log(`\n=== RESULTS: ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests().catch((e) => {
  console.error("TEST EXECUTION ERROR:", e);
  process.exit(1);
});
