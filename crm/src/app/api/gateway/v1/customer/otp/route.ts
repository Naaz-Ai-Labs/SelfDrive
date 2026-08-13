import { NextRequest, NextResponse } from "next/server";
import { randomInt, createHash } from "node:crypto";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { sbSelectOne, sbInsert, sbUpdate } from "@/lib/supabase-rest";
import { hashOtp, createCustomerSession, findCustomerByTarget, destroyCustomerSession } from "@/lib/portal-session";
import { normalizePhone } from "@/lib/utils";
import { logMessage } from "@/lib/activity";
import { getOtpProvider } from "@/lib/otp-provider";

const requestSchema = z.object({ op: z.literal("request"), target: z.string().min(3).max(120) });
const verifySchema = z.object({ op: z.literal("verify"), target: z.string().min(3).max(120), code: z.string().regex(/^\d{6}$/) });
const logoutSchema = z.object({ op: z.literal("logout"), token: z.string() });

function isEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

/** Never key a shared counter on a raw phone/email — hash it. */
function rateKeyFor(target: string): string {
  return `otp:${createHash("sha256").update(target).digest("hex").slice(0, 32)}`;
}

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

    // Shared across instances. The old Map was per-lambda, so the 60s cooldown could
    // be skipped simply by landing on a different instance — and a cold start reset
    // it entirely. Two limits: a short resend cooldown, and an hourly cap so one
    // number cannot be used to pump out messages all day.
    const rateKey = rateKeyFor(target);
    const cooldown = await consumeRateLimit({ key: `${rateKey}:resend`, maxAttempts: 1, windowSeconds: 60 });
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error:
            cooldown.reason === "unavailable"
              ? "Sign-in is temporarily unavailable. Please try again shortly."
              : "Please wait a minute before requesting another OTP.",
        },
        { status: cooldown.reason === "unavailable" ? 503 : 429 }
      );
    }
    const hourly = await consumeRateLimit({ key: `${rateKey}:hourly`, maxAttempts: 8, windowSeconds: 3600, blockSeconds: 3600 });
    if (!hourly.allowed) {
      return NextResponse.json({ error: "Too many OTP requests. Please try again later." }, { status: 429 });
    }

    // Math.random() is not cryptographically secure — its output is predictable from
    // observed values, so an attacker who requests a few OTPs can forecast the next
    // one and take over an account without ever seeing the SMS. randomInt() draws
    // from the OS CSPRNG.
    const code = String(randomInt(100000, 1000000));
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
      // Release the resend cooldown: the customer never got a code, so they must not
      // be made to wait a minute before trying again.
      await resetRateLimit(`${rateKey}:resend`);
      return NextResponse.json({ error: "Could not send an OTP right now. Please try again." }, { status: 502 });
    }
    await logMessage(isEmail(target) ? "email" : "whatsapp", target, "Your OTP for Darshh Holiday", `Your login OTP is ${code}. It is valid for 10 minutes.`);

    // Best-effort real delivery via a configured provider. This must never block or
    // fail the request — until the owner supplies WhatsApp/MSG91 credentials this
    // always resolves to NullOtpProvider's expected failure, and the existing
    // demo-mode/on-screen fallback below keeps working exactly as before.
    if (!isEmail(target)) {
      try {
        const provider = getOtpProvider();
        const result = await provider.send(target, code, "whatsapp");
        if (!result.ok) console.warn(`[otp] provider "${provider.name}" did not send: ${result.error}`);
      } catch (err) {
        console.warn("[otp] provider send threw:", err);
      }
    }

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
