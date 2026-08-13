import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCustomerSession } from "./portal-session";

/** Every gateway route is only reachable from the web app's own server (never the
 * browser), authenticated with a shared secret — this is the trust boundary between
 * the two deployments. */
export function requireGatewayKey(req: NextRequest): NextResponse | null {
  const expectedKey = process.env.GATEWAY_API_KEY;

  // No shared secret configured means the trust boundary does not exist. Deny rather
  // than falling back to a key that is committed to the repository.
  if (!expectedKey) {
    console.error("[SECURITY] GATEWAY_API_KEY is not set — refusing all gateway requests.");
    return NextResponse.json({ error: "Gateway not configured." }, { status: 503 });
  }

  const key = req.headers.get("x-gateway-key");
  if (!key || key.length !== expectedKey.length) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Constant-time compare: a plain !== leaks the key one byte at a time under timing analysis.
  if (!crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expectedKey))) {
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
