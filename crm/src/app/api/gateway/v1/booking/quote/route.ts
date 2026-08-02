import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getQuoteEstimate } from "@/lib/booking-actions";

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body?.vehicleId || !body?.pickupAt || !body?.returnAt) {
    return NextResponse.json({ error: "Missing vehicleId, pickupAt or returnAt." }, { status: 400 });
  }
  const quote = await getQuoteEstimate(Number(body.vehicleId), body.pickupAt, body.returnAt);
  return NextResponse.json({ quote });
}
