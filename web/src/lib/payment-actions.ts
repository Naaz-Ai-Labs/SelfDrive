"use server";

import { gatewayPost } from "./gateway";

export async function createBookingPaymentOrder(bookingId: number): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; businessName: string } | { ok: false; error: string }
> {
  return gatewayPost("/api/gateway/v1/payments/order", { bookingId });
}

export async function verifyBookingPayment(input: {
  paymentId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: true; bookingNo: string } | { ok: false; error: string }> {
  return gatewayPost("/api/gateway/v1/payments/verify", input);
}
