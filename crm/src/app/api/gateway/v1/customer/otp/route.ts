import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { getDb } from "@/lib/db";
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
    if (parsed.success) destroyCustomerSession(parsed.data.token);
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
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
    getDb().prepare("INSERT INTO otp_codes (target, purpose, code_hash, expires_at) VALUES (?, 'customer_login', ?, ?)").run(target, hashOtp(code), expires);
    logMessage(isEmail(target) ? "email" : "whatsapp", target, "Your OTP for Darshh Holiday", `Your login OTP is ${code}. It is valid for 10 minutes.`);

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

    const row = getDb()
      .prepare("SELECT id, code_hash, expires_at, used, attempts FROM otp_codes WHERE target = ? AND purpose = 'customer_login' AND used = 0 ORDER BY id DESC LIMIT 1")
      .get(target) as { id: number; code_hash: string; expires_at: string; used: number; attempts: number } | undefined;

    if (!row) return NextResponse.json({ error: "No active OTP found. Request a new one." }, { status: 400 });
    if (row.expires_at < new Date().toISOString().slice(0, 19).replace("T", " ")) {
      return NextResponse.json({ error: "This OTP has expired. Request a new one." }, { status: 400 });
    }
    if (row.attempts >= 5) return NextResponse.json({ error: "Too many wrong attempts. Request a new OTP." }, { status: 429 });

    if (hashOtp(parsed.data.code) !== row.code_hash) {
      getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
      return NextResponse.json({ error: "Incorrect OTP." }, { status: 401 });
    }
    getDb().prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").run(row.id);

    const customer = findCustomerByTarget(target);
    const token = createCustomerSession(customer?.id ?? null, target);
    return NextResponse.json({ ok: true, token, customerId: customer?.id ?? null });
  }

  return NextResponse.json({ error: "Invalid operation." }, { status: 400 });
}
