import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { sbSelectOne, sbInsert, sbUpdate } from "@/lib/supabase-rest";
import { hashOtp, createCustomerSession, findCustomerByTarget, destroyCustomerSession } from "@/lib/portal-session";
import { normalizePhone } from "@/lib/utils";
import { logMessage } from "@/lib/activity";

const requestSchema = z.object({ op: z.literal("request"), target: z.string().min(3).max(120) });
const verifySchema = z.object({ op: z.literal("verify"), target: z.string().min(3).max(120), code: z.string().regex(/^\d{6}$/) });
const logoutSchema = z.object({ op: z.literal("logout"), token: z.string() });

const rateLimits = new Map<string, number>();
function isEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

/** Same OTP flow as the CRM's own customer login, but returns the session token in the
 * JSON body instead of setting a cookie — the web app has its own origin, so it mints its
 * own httpOnly cookie holding this token and forwards it as a Bearer header on every
 * later gateway call that needs the customer's identity. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.op !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (body.op === "logout") {
    const parsed = logoutSchema.safeParse(body);
    if (parsed.success) await destroyCustomerSession(parsed.data.token);
    return NextResponse.json({ ok: true });
  }

  if (body.op === "request") {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid phone or email." }, { status: 400 });
    const target = isEmail(parsed.data.target) ? parsed.data.target.toLowerCase().trim() : normalizePhone(parsed.data.target);
    if (!target) return NextResponse.json({ error: "Enter a valid phone or email." }, { status: 400 });

    const last = rateLimits.get(target) ?? 0;
    if (Date.now() - last < 60_000) {
      return NextResponse.json({ error: "Please wait a minute before requesting another OTP." }, { status: 429 });
    }
    rateLimits.set(target, Date.now());

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const inserted = await sbInsert("otp_codes", {
      target,
      purpose: "customer_login",
      code_hash: hashOtp(code),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used: 0,
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    // Claiming an OTP was sent when it was never stored leaves the customer entering a
    // code that can never verify. Fail loudly instead.
    if (!inserted.ok) {
      rateLimits.delete(target);
      return NextResponse.json({ error: "Could not send an OTP right now. Please try again." }, { status: 502 });
    }
    await logMessage(isEmail(target) ? "email" : "whatsapp", target, "Your OTP for Darshh Holiday", `Your login OTP is ${code}. It is valid for 10 minutes.`);

    const demo = process.env.NODE_ENV !== "production";
    return NextResponse.json({
      ok: true, sent: true, demoCode: demo ? code : undefined,
      message: demo ? "Demo mode: OTP shown for testing — it will be sent via WhatsApp/email in production." : "OTP sent.",
    });
  }

  if (body.op === "verify") {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit OTP." }, { status: 400 });
    const target = isEmail(parsed.data.target) ? parsed.data.target.toLowerCase().trim() : normalizePhone(parsed.data.target);

    const found = await sbSelectOne<{ id: number; code_hash: string; expires_at: string; used: number; attempts: number }>(
      "otp_codes",
      `select=id,code_hash,expires_at,used,attempts&target=eq.${encodeURIComponent(target)}&purpose=eq.customer_login&used=eq.0&order=id.desc`
    );
    if (!found.ok) return NextResponse.json({ error: "Could not verify the OTP right now. Please try again." }, { status: 502 });

    const row = found.data;
    if (!row) return NextResponse.json({ error: "No active OTP found. Request a new one." }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This OTP has expired. Request a new one." }, { status: 400 });
    }
    if (Number(row.attempts) >= 5) return NextResponse.json({ error: "Too many wrong attempts. Request a new OTP." }, { status: 429 });

    if (hashOtp(parsed.data.code) !== row.code_hash) {
      const bumped = await sbUpdate("otp_codes", `id=eq.${row.id}`, { attempts: Number(row.attempts) + 1 });
      if (!bumped.ok) console.error("[otp] attempt counter not incremented:", bumped.error);
      return NextResponse.json({ error: "Incorrect OTP." }, { status: 401 });
    }

    // Burn the code with `used = 0` still in the filter: two concurrent verifications of
    // the same OTP must not both come back with a session.
    const burned = await sbUpdate<{ id: number }>("otp_codes", `id=eq.${row.id}&used=eq.0`, { used: 1 });
    if (!burned.ok) return NextResponse.json({ error: "Could not verify the OTP right now. Please try again." }, { status: 502 });
    if (burned.data.length === 0) return NextResponse.json({ error: "This OTP has already been used. Request a new one." }, { status: 400 });

    const customer = await findCustomerByTarget(target);
    const token = await createCustomerSession(customer?.id ?? null, target);
    return NextResponse.json({ ok: true, token, customerId: customer?.id ?? null });
  }

  return NextResponse.json({ error: "Invalid operation." }, { status: 400 });
}
