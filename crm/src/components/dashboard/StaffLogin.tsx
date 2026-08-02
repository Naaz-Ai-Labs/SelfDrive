"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="sl-email">Email</label>
        <input id="sl-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="sl-password">Password</label>
        <input id="sl-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
