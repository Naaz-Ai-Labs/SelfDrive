import { NextRequest, NextResponse } from "next/server";
import { gatewayPost, CUSTOMER_COOKIE } from "@/lib/gateway";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function normalizeTarget(target: string): string {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);
  if (isEmail) return target.toLowerCase().trim();
  const digits = target.replace(/[^\d+]/g, "");
  if (digits.startsWith("+91")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits;
}

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.op !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // 1. Primary Attempt via CRM Gateway API
  try {
    const result = await gatewayPost<{ ok?: boolean; error?: string; token?: string; customerId?: number | null; sent?: boolean; demoCode?: string; message?: string }>(
      "/api/gateway/v1/customer/otp", body
    );

    if (result && !result.error && (result.ok || result.sent || result.token)) {
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
  } catch (err) {
    console.warn("Gateway OTP fetch warning, falling back to direct Supabase:", err);
  }

  // 2. High-Availability Direct Supabase PostgreSQL Fallback
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Could not connect to authentication service." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (body.op === "request") {
    if (!body.target || typeof body.target !== "string" || body.target.trim().length < 3) {
      return NextResponse.json({ error: "Enter a valid phone number or email." }, { status: 400 });
    }
    const target = normalizeTarget(body.target);
    // Cryptographically secure — Math.random() is predictable from prior outputs,
    // which lets an attacker forecast an OTP without ever receiving the message.
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
      await supabase.from("otp_codes").insert({
        target,
        purpose: "customer_login",
        code_hash: codeHash,
        expires_at: expiresAt,
        used: 0,
        attempts: 0,
      });

      // Cache demo OTP code in Redis for instant fallback lookup
      try {
        const { cacheSet } = await import("@/lib/redis");
        await cacheSet(`otp:${target}`, code, 600);
      } catch {}

      // Best-effort real delivery via a configured provider. Never blocks or fails the
      // request — until the owner supplies WhatsApp/MSG91 credentials this always
      // resolves to NullOtpProvider's expected failure, and the demo-mode/on-screen
      // fallback above (ALLOW_DEMO_OTP) keeps working exactly as before.
      if (!target.includes("@")) {
        try {
          const { getOtpProvider } = await import("@/lib/otp-provider");
          const provider = getOtpProvider();
          const result = await provider.send(target, code, "whatsapp");
          if (!result.ok) console.warn(`[otp] provider "${provider.name}" did not send: ${result.error}`);
        } catch (err) {
          console.warn("[otp] provider send threw:", err);
        }
      }

      // Returning the OTP to the caller defeats the entire purpose of an OTP: anyone
      // could request a code for any phone number and read it out of this response.
      // It stays available only behind an explicit opt-in flag for local demos.
      const demoMode = process.env.ALLOW_DEMO_OTP === "true";

      return NextResponse.json({
        ok: true,
        sent: true,
        ...(demoMode ? { demoCode: code } : {}),
        message: demoMode
          ? "Demo mode: OTP shown on screen. Do not enable this in production."
          : "OTP generated. Our team will send it to you shortly.",
      });
    } catch (err: any) {
      console.error("Supabase OTP request insert error:", err?.message || err);
      return NextResponse.json({ error: "Could not generate OTP. Please try again." }, { status: 500 });
    }
  }

  if (body.op === "verify") {
    if (!body.target || !body.code) {
      return NextResponse.json({ error: "Enter the 6-digit OTP." }, { status: 400 });
    }
    const target = normalizeTarget(body.target);
    const inputCode = String(body.code).trim();
    const inputHash = hashOtp(inputCode);

    try {
      // Find latest unused OTP code for target
      const { data: rows } = await supabase
        .from("otp_codes")
        .select("*")
        .eq("target", target)
        .eq("purpose", "customer_login")
        .eq("used", 0)
        .order("id", { ascending: false })
        .limit(1);

      const latestOtp = rows && rows[0];

      let isValid = false;
      if (latestOtp && latestOtp.code_hash === inputHash) {
        isValid = true;
      } else {
        // Fallback Redis OTP check
        try {
          const { cacheGet } = await import("@/lib/redis");
          const cachedCode = await cacheGet<string>(`otp:${target}`);
          if (cachedCode && cachedCode === inputCode) {
            isValid = true;
          }
        } catch {}
      }

      // There was a universal backdoor code here ("123456") that authenticated as ANY
      // customer. Removed unconditionally — it is not needed even for demos, since
      // ALLOW_DEMO_OTP already surfaces the real generated code.
      if (!isValid) {
        return NextResponse.json({ error: "Incorrect OTP code. Please try again." }, { status: 401 });
      }

      // Mark OTP as used
      if (latestOtp?.id) {
        try {
          await supabase.from("otp_codes").update({ used: 1 }).eq("id", latestOtp.id);
        } catch {}
      }

      // Find or create customer
      let customerId: number | null = null;
      try {
        const isEmail = target.includes("@");
        const matchField = isEmail ? "email" : "phone";
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq(matchField, target)
          .single();

        if (existingCust?.id) {
          customerId = existingCust.id;
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              name: target.split("@")[0],
              phone: isEmail ? null : target,
              email: isEmail ? target : null,
            })
            .select("id")
            .single();
          if (newCust?.id) customerId = newCust.id;
        }
      } catch {}

      // MINT CUSTOMER SESSION TOKEN
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

      try {
        await supabase.from("customer_sessions").insert({
          token,
          customer_id: customerId,
          target,
          expires_at: expiresAt,
        });
      } catch {}

      // Cache session in Redis
      try {
        const { cacheSet } = await import("@/lib/redis");
        await cacheSet(`session:customer:${token}`, { customerId, target }, 7 * 86400);
      } catch {}

      const res = NextResponse.json({ ok: true, customerId });
      res.cookies.set(CUSTOMER_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 3600,
      });
      return res;
    } catch (err: any) {
      console.error("Supabase OTP verify error:", err?.message || err);
      return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid operation." }, { status: 400 });
}
