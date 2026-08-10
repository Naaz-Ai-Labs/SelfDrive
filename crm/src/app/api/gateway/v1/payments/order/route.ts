import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { createBookingPaymentOrder } from "@/lib/payment-actions";

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body?.bookingId) return NextResponse.json({ ok: false, error: "Missing bookingId." }, { status: 400 });
  const res = await createBookingPaymentOrder(Number(body.bookingId), body.amountDue ? Number(body.amountDue) : undefined);
  return NextResponse.json(res);
}
