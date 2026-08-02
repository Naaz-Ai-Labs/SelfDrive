import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { submitBooking } from "@/lib/booking-actions";

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  const res = await submitBooking(body);
  return NextResponse.json(res);
}
