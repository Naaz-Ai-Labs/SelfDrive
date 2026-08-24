import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { createBookingPaymentOrder } from "@/lib/payment-actions";

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const res = await createBookingPaymentOrder(
    body?.bookingId ? Number(body.bookingId) : null,
    body?.amountDue ? Number(body.amountDue) : undefined,
    body?.quote ?? null,
    body?.customer ?? null
  );
  return NextResponse.json(res);
}
