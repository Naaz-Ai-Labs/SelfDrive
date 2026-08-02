import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getVehicleById } from "@/lib/data";

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ vehicle: null });
  const vehicle = getVehicleById(id);
  return NextResponse.json({ vehicle });
}
