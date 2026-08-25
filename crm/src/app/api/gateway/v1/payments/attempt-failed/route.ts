import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { recordFailedPaymentAttempt } from "@/lib/payment-actions";

/**
 * Reports that a payment attempt did not complete — the customer dismissed the
 * Razorpay checkout, or it errored client-side before any webhook could ever fire
 * (a dismissed checkout creates no payment entity at Razorpay, so payment.failed
 * never arrives for it). Safe regardless of why it's called: recordFailedPaymentAttempt
 * never overwrites an already-Paid row, and only releases the reservation after
 * independently re-verifying no successful payment exists for the booking.
 */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const paymentId = body?.paymentId ? Number(body.paymentId) : null;
  if (!paymentId || !Number.isFinite(paymentId)) {
    return NextResponse.json({ ok: false, error: "paymentId is required." }, { status: 400 });
  }
  const res = await recordFailedPaymentAttempt(paymentId);
  return NextResponse.json(res);
}
