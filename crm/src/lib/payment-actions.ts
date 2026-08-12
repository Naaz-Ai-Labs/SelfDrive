"use server";

import { getDb } from "./db";
import { nextNumber } from "./utils";
import { logActivity, pushNotification } from "./activity";
import { sendTemplate } from "./messaging";
import { createRazorpayOrder, verifyRazorpaySignature, fetchRazorpayPayment, razorpayConfigured, razorpayKeyId } from "./razorpay";
import { generateInvoiceForBooking } from "./invoices";
import { toPaise, syncPaymentToSupabase } from "./supabase-sync";

/**
 * Creates (or reuses) a Pending payment record for the full outstanding amount on a
 * booking and opens a matching Razorpay order against it. Called from the booking
 * confirmation step and from the customer portal's "Pay now".
 */
export async function createBookingPaymentOrder(bookingId: number, overrideAmount?: number): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; notes?: Record<string, string>; businessName: string } | { ok: false; error: string }
> {
  if (!razorpayConfigured()) {
    return { ok: false, error: "Online payment isn't set up yet. Our team will contact you on WhatsApp to arrange payment." };
  }
  const db = getDb();
  let booking = db
    .prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.id = ?")
    .get(bookingId) as Record<string, unknown> | undefined;

  if (!booking) {
    // Check Supabase
    try {
      const { supabaseAdmin, supabase } = await import("./supabase");
      const client = supabaseAdmin || supabase;
      if (client) {
        const { data: sbBooking } = await client.from("bookings").select("*").eq("id", bookingId).single();
        if (sbBooking) {
          booking = {
            id: sbBooking.id,
            booking_no: sbBooking.booking_no || `BK-${sbBooking.id}`,
            customer_id: sbBooking.customer_id,
            total_amount: Number(sbBooking.total_amount || 1000),
            deposit_amount: Number(sbBooking.deposit_amount || 1000),
            paid_amount: Number(sbBooking.paid_amount || 0),
            status: sbBooking.status || "Pending",
          };
        }
      }
    } catch {}
  }

  if (!booking) return { ok: false, error: "Booking not found." };

  const due = (overrideAmount && overrideAmount > 0)
    ? overrideAmount
    : Math.max(1, Number(booking.total_amount) - Number(booking.paid_amount || 0));

  if (due <= 0) return { ok: false, error: "This booking is already fully paid." };

  const duePaise = Math.max(100, toPaise(due));

  let payment = db
    .prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'Pending' AND kind = 'full' ORDER BY id DESC LIMIT 1")
    .get(bookingId) as { id: number; payment_no: string; amount: number; amount_paise: number } | undefined;

  const breakdownJson = JSON.stringify({
    baseAmount: Number(booking.base_amount || (due - Number(booking.deposit_amount || 0))),
    depositAmount: Number(booking.deposit_amount || 0),
    gstAmount: Number(booking.gst_amount || 0),
    totalAmount: due,
  });

  if (!payment) {
    const paymentNo = nextNumber("PY", null);
    const result = db
      .prepare("INSERT INTO payments (payment_no, booking_id, customer_id, amount, amount_paise, kind, status, notes, breakdown_json) VALUES (?, ?, ?, ?, ?, 'full', 'Pending', 'Rental total + deposit', ?)")
      .run(paymentNo, bookingId, booking.customer_id as number | null, due, duePaise, breakdownJson);
    payment = { id: Number(result.lastInsertRowid), payment_no: paymentNo, amount: due, amount_paise: duePaise };
  } else {
    db.prepare("UPDATE payments SET breakdown_json = ? WHERE id = ?").run(breakdownJson, payment.id);
  }

  const baseAmount = Number(booking.total_amount);
  const depositAmount = Number(booking.deposit_amount);
  const gstAmount = Math.round(baseAmount * 0.06);

  const rzpNotes: Record<string, string> = {
    "Booking No": String(booking.booking_no),
    "Rental Base": `₹${baseAmount.toLocaleString("en-IN")}`,
    "Pickup Fee": `₹250`,
    "GST (6%)": `₹${gstAmount.toLocaleString("en-IN")}`,
    "Refundable Deposit": `₹${depositAmount.toLocaleString("en-IN")}`,
  };

  const order = await createRazorpayOrder({ amountInRupees: payment.amount, receipt: payment.payment_no, notes: rzpNotes });
  if (!order.ok) return { ok: false, error: order.error };

  db.prepare("UPDATE payments SET gateway_ref = ?, razorpay_order_id = ?, amount_paise = ? WHERE id = ?").run(order.orderId, order.orderId, duePaise, payment.id);

  // Sync transaction to Supabase
  syncPaymentToSupabase(payment.id).catch(() => {});

  return {
    ok: true,
    orderId: order.orderId,
    amountPaise: order.amount,
    keyId: razorpayKeyId()!,
    paymentId: payment.id,
    paymentNo: payment.payment_no,
    notes: rzpNotes,
    businessName: "Darshh Holiday",
  };
}

export async function verifyBookingPayment(input: {
  paymentId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  skipSignatureCheck?: boolean;
}): Promise<{ ok: true; bookingNo: string; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const db = getDb();

  // 1. Idempotency Check: if this payment ID was already processed, return success immediately
  const existingPaid = db
    .prepare("SELECT p.*, b.booking_no FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE (p.razorpay_payment_id = ? OR (p.id = ? AND p.status = 'Paid')) LIMIT 1")
    .get(input.razorpayPaymentId, input.paymentId) as { booking_no: string; status: string } | undefined;

  if (existingPaid && existingPaid.status === "Paid") {
    return { ok: true, bookingNo: existingPaid.booking_no || `BK-${input.paymentId}`, alreadyProcessed: true };
  }

  if (!input.skipSignatureCheck) {
    const valid = verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature);
    if (!valid) {
      logActivity(null, "payment_signature_invalid", "payment", input.paymentId, { orderId: input.razorpayOrderId });
      return { ok: false, error: "We could not verify this payment. If money was deducted, contact us with your booking number and we'll sort it out." };
    }
  }

  const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND (gateway_ref = ? OR razorpay_order_id = ?)").get(input.paymentId, input.razorpayOrderId, input.razorpayOrderId) as
    | { id: number; booking_id: number; customer_id: number | null; amount: number; payment_no: string; status: string }
    | undefined;
  if (!payment) return { ok: false, error: "Payment record not found." };
  if (payment.status === "Paid") {
    const booking = db.prepare("SELECT booking_no FROM bookings WHERE id = ?").get(payment.booking_id) as { booking_no: string };
    return { ok: true, bookingNo: booking.booking_no, alreadyProcessed: true };
  }

  const receiptNo = nextNumber("RC", null);

  // Fetch verified payment details directly from Razorpay API
  let realMethod: string | null = null;
  let realVpa: string | null = null;
  let realBankRef: string | null = null;

  try {
    const rzpRes = await fetchRazorpayPayment(input.razorpayPaymentId);
    if (rzpRes.ok) {
      const p = rzpRes.payment;
      realVpa = p.vpa || p.upi?.vpa || null;
      realMethod = p.method ? (p.method.toLowerCase() === "upi" ? "UPI" : p.method.toUpperCase()) : null;
      realBankRef = p.acquirer_data?.rrn || p.acquirer_data?.upi_transaction_id || p.acquirer_data?.bank_transaction_id || null;
    }
  } catch {}

  db.prepare(
    `UPDATE payments SET
       status = 'Paid',
       paid_at = datetime('now'),
       method = COALESCE(?, method, 'Online'),
       upi_id = COALESCE(?, upi_id),
       vpa = COALESCE(?, vpa),
       bank_ref_no = COALESCE(?, bank_ref_no),
       notes = ?,
       receipt_no = ?,
       razorpay_order_id = ?,
       razorpay_payment_id = ?,
       razorpay_signature = ?
     WHERE id = ?`
  ).run(
    realMethod,
    realVpa,
    realVpa,
    realBankRef,
    `Razorpay payment ID: ${input.razorpayPaymentId}`,
    receiptNo,
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    payment.id
  );

  // Sync to Supabase ledger
  syncPaymentToSupabase(payment.id).catch(() => {});

  // Check if documents are already verified
  const unverifiedDocsCount = (db.prepare("SELECT COUNT(*) AS c FROM customer_documents WHERE booking_id = ? AND verified = 0").get(payment.booking_id) as { c: number })?.c ?? 0;
  const newBookingStatus = unverifiedDocsCount === 0 ? "Confirmed" : "Payment received";

  db.prepare("UPDATE bookings SET paid_amount = paid_amount + ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
    payment.amount, newBookingStatus, payment.booking_id
  );

  db.prepare("INSERT INTO booking_history (booking_id, action, detail) VALUES (?, 'payment_verified', ?)").run(
    payment.booking_id, JSON.stringify({ payment_no: payment.payment_no, amount: payment.amount, razorpay_payment_id: input.razorpayPaymentId, status: newBookingStatus })
  );
  logActivity(null, "payment_verified", "payment", payment.id, { amount: payment.amount, razorpay_payment_id: input.razorpayPaymentId });
  const invoice = generateInvoiceForBooking(payment.booking_id);

  const booking = db
    .prepare(`SELECT b.booking_no, b.pickup_at, c.name, c.phone, v.name AS vehicle_name FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN vehicles v ON v.id = b.vehicle_id WHERE b.id = ?`)
    .get(payment.booking_id) as { booking_no: string; pickup_at: string; name: string | null; phone: string | null; vehicle_name: string | null };

  if (booking && booking.phone) {
    try {
      sendTemplate("payment_receipt", booking.phone, { name: booking.name ?? "", amount: `₹${payment.amount.toLocaleString("en-IN")}`, reference: input.razorpayPaymentId, receipt_no: receiptNo, booking_no: booking.booking_no }, null, payment.booking_id);
      sendTemplate("booking_confirmation", booking.phone, { name: booking.name ?? "", booking_no: booking.booking_no, vehicle: booking.vehicle_name ?? "", pickup_at: booking.pickup_at, location: "" }, null, payment.booking_id);
      sendTemplate("invoice_generated", booking.phone, { name: booking.name ?? "", invoice_no: invoice.invoiceNo, booking_no: booking.booking_no, total: `₹${payment.amount.toLocaleString("en-IN")}` }, null, payment.booking_id);
    } catch {
      // best-effort — messaging must never block a verified payment from being recorded
    }
  }

  if (booking) {
    const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1").all() as { id: number }[];
    for (const s of staff) {
      pushNotification(s.id, `Payment received — ${booking.booking_no}`, `${booking.name ?? "Customer"} · ${booking.vehicle_name ?? ""}`, null, payment.booking_id);
    }
  }

  return { ok: true, bookingNo: booking?.booking_no || "" };
}
