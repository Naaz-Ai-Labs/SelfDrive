import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getAvailableVehicles } from "@/lib/booking-actions";

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const vehicles = await getAvailableVehicles(
    searchParams.get("kind"),
    searchParams.get("pickupAt"),
    searchParams.get("returnAt")
  );
  return NextResponse.json({ vehicles });
}
