import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { verifyBookingPayment } from "@/lib/payment-actions";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";

/**
 * Server-to-server webhook handler for Razorpay asynchronous notifications
 * (e.g. payment.captured, order.paid, payment.failed, refund.processed).
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing X-Razorpay-Signature header." }, { status: 400 });
  }

  const rawBody = await req.text();
  const valid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 400 });
  }

  let event: { event?: string; payload?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const eventType = event.event;
  const payload = event.payload;

  if (eventType === "payment.captured" || eventType === "order.paid") {
    const entity = payload?.payment?.entity ?? payload?.order?.entity;
    const orderId = entity?.order_id ?? entity?.id;
    const paymentId = entity?.id ?? entity?.payment_id;

    if (orderId && paymentId) {
      const db = getDb();
      const paymentRow = db.prepare("SELECT id FROM payments WHERE gateway_ref = ?").get(orderId) as { id: number } | undefined;
      if (paymentRow) {
        await verifyBookingPayment({
          paymentId: paymentRow.id,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          skipSignatureCheck: true,
        });
      }
    }
  } else if (eventType === "payment.failed") {
    const paymentEntity = payload?.payment?.entity;
    if (paymentEntity?.order_id) {
      const db = getDb();
      db.prepare("UPDATE payments SET status = 'Failed' WHERE gateway_ref = ? AND status = 'Pending'").run(paymentEntity.order_id);
      logActivity(null, "payment_failed_webhook", "payment", null, {
        orderId: paymentEntity.order_id,
        reason: paymentEntity.error_description ?? "Payment failed",
      });
    }
  } else if (eventType === "refund.processed") {
    const refundEntity = payload?.refund?.entity;
    if (refundEntity?.id && refundEntity?.payment_id) {
      const db = getDb();
      db.prepare("UPDATE refunds SET status = 'Completed', completed_at = datetime('now'), transaction_ref = ? WHERE status IN ('Requested', 'Approved', 'Processing') AND (transaction_ref = ? OR admin_notes LIKE ?)").run(
        refundEntity.id,
        refundEntity.id,
        `%${refundEntity.payment_id}%`
      );
      logActivity(null, "refund_processed_webhook", "refund", null, {
        refundId: refundEntity.id,
        amount: refundEntity.amount / 100,
      });
    }
  }

  return NextResponse.json({ status: "ok" });
}
