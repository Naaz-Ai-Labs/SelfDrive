import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { saveBookingDraft, getDraft } from "@/lib/booking-actions";

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ draft: null });
  const draft = await getDraft(token);
  return NextResponse.json({ draft });
}

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const res = await saveBookingDraft(body);
  return NextResponse.json(res);
}
