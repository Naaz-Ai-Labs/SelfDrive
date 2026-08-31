import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getVehicleById } from "@/lib/data";

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ vehicle: null });
  // Without the requested dates, getVehicleById reports "is this vehicle out at ANY
  // point from now on", so a vehicle with an unrelated future booking comes back
  // status: "unavailable" / available_units: 0. The booking form uses this as its
  // fallback vehicle summary, so that undated answer became "The selected vehicle is
  // currently unavailable…" for a vehicle that is free on the dates asked for.
  const pickupAt = searchParams.get("pickupAt");
  const returnAt = searchParams.get("returnAt");
  const vehicle = await getVehicleById(id, true, pickupAt && returnAt ? { pickupAt, returnAt } : undefined);
  return NextResponse.json({ vehicle });
}
