"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Reads a JSON body only when the response really is JSON — an HTML error page would
 * otherwise blow up in `res.json()` with "Unexpected token '<'". */
async function readJsonResponse(res: Response): Promise<{ ok: boolean; data: any }> {
  if (!res.headers.get("content-type")?.includes("application/json")) {
    const body = await res.text().catch(() => "");
    console.warn(`OTP endpoint non-JSON response (${res.status}):`, body.slice(0, 200));
    return { ok: false, data: { error: `Server returned an unexpected response (${res.status}).` } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function CustomerLogin() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"idle" | "requesting" | "code">("idle");
  const [error, setError] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [timer, setTimer] = useState(0);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPhase("requesting");
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "request", target }),
      });
      const { ok, data } = await readJsonResponse(res);
      if (!ok) {
        setError(data.error ?? "Could not send OTP.");
        setPhase("idle");
        return;
      }
      setDemoCode(data.demoCode ?? "");
      setPhase("code");
      let left = 60;
      setTimer(left);
      const iv = setInterval(() => {
        left -= 1;
        setTimer(left);
        if (left <= 0) clearInterval(iv);
      }, 1000);
    } catch {
      setError("Network error. Please try again.");
      setPhase("idle");
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "verify", target, code }),
      });
      const { ok, data } = await readJsonResponse(res);
      if (!ok) {
        setError(data.error ?? "Verification failed.");
        return;
      }
      window.location.href = "/customer/portal";
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={phase === "code" ? verifyOtp : requestOtp} noValidate className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="otp-target">Phone number or email</label>
        <input
          id="otp-target"
          className="input"
          value={target}
          disabled={phase === "code"}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="+91 98765 43210 or you@example.com"
          autoComplete="tel"
        />
      </div>
      {phase === "code" && (
        <div>
          <label className="label" htmlFor="otp-code">Enter the 6-digit OTP</label>
          <input
            id="otp-code"
            className="input tracking-[0.4em] text-center font-mono text-lg"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            autoFocus
          />
          {demoCode && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Demo mode — your OTP is <strong>{demoCode}</strong>. In production this is delivered via WhatsApp/email.
            </p>
          )}
          {timer > 0 && <p className="mt-2 text-xs text-ink-400">You can request a new code in {timer}s.</p>}
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={phase === "requesting" || timer > 0 && phase === "code"}>
        {phase === "requesting" ? "Sending…" : phase === "code" ? "Verify & log in" : "Send OTP"}
      </button>
      {phase === "code" && (
        <button type="button" className="w-full text-center text-xs font-medium text-ink-500 underline-offset-2 hover:underline" onClick={() => setPhase("idle")}>
          Use a different number / email
        </button>
      )}
    </form>
  );
}
