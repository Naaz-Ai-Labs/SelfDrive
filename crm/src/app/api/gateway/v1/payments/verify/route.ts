import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { verifyBookingPayment } from "@/lib/payment-actions";

/** The one moment the CRM treats a booking as paid — signature-verified here, then the
 * booking auto-confirms, an invoice is generated and WhatsApp confirmations go out, all
 * inside verifyBookingPayment(). The web app never sees the Razorpay secret; it only
 * relays the checkout response fields through this gateway call. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body?.paymentId || !body?.razorpayOrderId || !body?.razorpayPaymentId || !body?.razorpaySignature) {
    return NextResponse.json({ ok: false, error: "Missing payment verification fields." }, { status: 400 });
  }
  const res = await verifyBookingPayment(body);
  return NextResponse.json(res);
}
