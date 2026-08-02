import { NextRequest, NextResponse } from "next/server";
import { gatewayPost, CUSTOMER_COOKIE } from "@/lib/gateway";

/** Thin proxy to the CRM gateway's OTP endpoint. On successful verify, the gateway
 * returns an opaque session token in the JSON body (not a cookie — it has no origin to
 * set one on) and this route mints web's own httpOnly cookie holding that token. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.op !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await gatewayPost<{ ok?: boolean; error?: string; token?: string; customerId?: number | null; sent?: boolean; demoCode?: string; message?: string }>(
    "/api/gateway/v1/customer/otp", body
  );

  if (!result || result.error) {
    return NextResponse.json({ error: result?.error ?? "Something went wrong." }, { status: 400 });
  }

  if (body.op === "verify" && result.token) {
    const res = NextResponse.json({ ok: true, customerId: result.customerId ?? null });
    res.cookies.set(CUSTOMER_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
    return res;
  }

  return NextResponse.json(result);
}
