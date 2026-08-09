"use client";

import { useState } from "react";

export function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      // Call CRM auth endpoint to establish local session cookie
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

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="sl-email">
          Email
        </label>
        <input
          id="sl-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@darshhrentals.in"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="label" htmlFor="sl-password">
          Password
        </label>
        <input
          id="sl-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>

      <div className="flex gap-2 text-xs text-slate-500 pt-1">
        <span>Quick fill:</span>
        <button
          type="button"
          onClick={() => {
            setEmail("admin@darshhrentals.in");
            setPassword("Admin@123");
          }}
          className="text-amber-600 hover:underline font-medium"
        >
          Admin
        </button>
        <span>•</span>
        <button
          type="button"
          onClick={() => {
            setEmail("staff@darshhrentals.in");
            setPassword("Staff@123");
          }}
          className="text-amber-600 hover:underline font-medium"
        >
          Staff
        </button>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Signing in..." : "Sign in to CRM"}
      </button>
    </form>
  );
}
