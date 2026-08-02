"use server";

import { getDb } from "./db";
import { nextNumber } from "./utils";
import { logActivity, pushNotification } from "./activity";
import { sendTemplate } from "./messaging";
import { createRazorpayOrder, verifyRazorpaySignature, razorpayConfigured, razorpayKeyId } from "./razorpay";
import { generateInvoiceForBooking } from "./invoices";

/**
 * Creates (or reuses) a Pending payment record for the full outstanding amount on a
 * booking and opens a matching Razorpay order against it. Called from the booking
 * confirmation step and from the customer portal's "Pay now".
 */
export async function createBookingPaymentOrder(bookingId: number): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; businessName: string } | { ok: false; error: string }
> {
  if (!razorpayConfigured()) {
    return { ok: false, error: "Online payment isn't set up yet. Our team will contact you on WhatsApp to arrange payment." };
  }
  const db = getDb();
  const booking = db
    .prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.id = ?")
    .get(bookingId) as Record<string, unknown> | undefined;
  if (!booking) return { ok: false, error: "Booking not found." };

  const due = Number(booking.total_amount) + Number(booking.deposit_amount) - Number(booking.paid_amount);
  if (due <= 0) return { ok: false, error: "This booking is already fully paid." };

  let payment = db
    .prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'Pending' AND kind = 'full' ORDER BY id DESC LIMIT 1")
    .get(bookingId) as { id: number; payment_no: string; amount: number } | undefined;

  if (!payment) {
    const paymentNo = nextNumber("PY", null);
    const result = db
      .prepare("INSERT INTO payments (payment_no, booking_id, customer_id, amount, kind, status, notes) VALUES (?, ?, ?, ?, 'full', 'Pending', 'Rental total + deposit')")
      .run(paymentNo, bookingId, booking.customer_id as number | null, due);
    payment = { id: Number(result.lastInsertRowid), payment_no: paymentNo, amount: due };
  }

  const order = await createRazorpayOrder({ amountInRupees: payment.amount, receipt: payment.payment_no, notes: { booking_no: String(booking.booking_no), payment_no: payment.payment_no } });
  if (!order.ok) return { ok: false, error: order.error };

  db.prepare("UPDATE payments SET gateway_ref = ? WHERE id = ?").run(order.orderId, payment.id);

  return {
    ok: true,
    orderId: order.orderId,
    amountPaise: order.amount,
    keyId: razorpayKeyId()!,
    paymentId: payment.id,
    paymentNo: payment.payment_no,
    businessName: "Darshh Holiday",
  };
}

export async function verifyBookingPayment(input: {
  paymentId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: true; bookingNo: string } | { ok: false; error: string }> {
  const valid = verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature);
  if (!valid) {
    logActivity(null, "payment_signature_invalid", "payment", input.paymentId, { orderId: input.razorpayOrderId });
    return { ok: false, error: "We could not verify this payment. If money was deducted, contact us with your booking number and we'll sort it out." };
  }

  const db = getDb();
  const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND gateway_ref = ?").get(input.paymentId, input.razorpayOrderId) as
    | { id: number; booking_id: number; customer_id: number | null; amount: number; payment_no: string; status: string }
    | undefined;
  if (!payment) return { ok: false, error: "Payment record not found." };
  if (payment.status === "Paid") {
    const booking = db.prepare("SELECT booking_no FROM bookings WHERE id = ?").get(payment.booking_id) as { booking_no: string };
    return { ok: true, bookingNo: booking.booking_no };
  }

  const receiptNo = nextNumber("RC", null);
  db.prepare("UPDATE payments SET status = 'Paid', paid_at = datetime('now'), notes = ?, receipt_no = ? WHERE id = ?").run(
    `Razorpay payment ID: ${input.razorpayPaymentId}`, receiptNo, payment.id
  );
  // Payment verified -> booking auto-confirms. This is the one moment the CRM should treat
  // as ground truth for "paid": we only ever get here after the Razorpay signature check above.
  db.prepare("UPDATE bookings SET paid_amount = paid_amount + ?, status = 'Confirmed', updated_at = datetime('now') WHERE id = ?").run(
    payment.amount, payment.booking_id
  );
  db.prepare("INSERT INTO booking_history (booking_id, action, detail) VALUES (?, 'payment_verified', ?)").run(
    payment.booking_id, JSON.stringify({ payment_no: payment.payment_no, amount: payment.amount, razorpay_payment_id: input.razorpayPaymentId })
  );
  logActivity(null, "payment_verified", "payment", payment.id, { amount: payment.amount });
  const invoice = generateInvoiceForBooking(payment.booking_id);

  const booking = db
    .prepare(`SELECT b.booking_no, b.pickup_at, c.name, c.phone, v.name AS vehicle_name FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN vehicles v ON v.id = b.vehicle_id WHERE b.id = ?`)
    .get(payment.booking_id) as { booking_no: string; pickup_at: string; name: string | null; phone: string | null; vehicle_name: string | null };

  if (booking.phone) {
    try {
      sendTemplate("payment_receipt", booking.phone, { name: booking.name ?? "", amount: `₹${payment.amount.toLocaleString("en-IN")}`, reference: input.razorpayPaymentId, receipt_no: receiptNo, booking_no: booking.booking_no }, null, payment.booking_id);
      sendTemplate("booking_confirmation", booking.phone, { name: booking.name ?? "", booking_no: booking.booking_no, vehicle: booking.vehicle_name ?? "", pickup_at: booking.pickup_at, location: "" }, null, payment.booking_id);
      sendTemplate("invoice_generated", booking.phone, { name: booking.name ?? "", invoice_no: invoice.invoiceNo, booking_no: booking.booking_no, total: `₹${payment.amount.toLocaleString("en-IN")}` }, null, payment.booking_id);
    } catch {
      // best-effort — messaging must never block a verified payment from being recorded
    }
  }

  const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1").all() as { id: number }[];
  for (const s of staff) {
    pushNotification(s.id, `Payment received — ${booking.booking_no}`, `${booking.name ?? "Customer"} · ${booking.vehicle_name ?? ""}`, null, payment.booking_id);
  }

  return { ok: true, bookingNo: booking.booking_no };
}
