import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "./portal-session";

/** Every gateway route is only reachable from the web app's own server (never the
 * browser), authenticated with a shared secret — this is the trust boundary between
 * the two deployments. */
const DEFAULT_GATEWAY_KEY = "gtw_darshh_sec_9845210001_88f9a2b1c3";

export function requireGatewayKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get("x-gateway-key");
  const expectedKey = process.env.GATEWAY_API_KEY || DEFAULT_GATEWAY_KEY;
  if (!key || key !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

export function bearerCustomer(req: NextRequest): { token: string; customerId: number | null; target: string } | null {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const session = getCustomerSession(token);
  if (!session) return null;
  return { token, customerId: session.customerId, target: session.target };
}
