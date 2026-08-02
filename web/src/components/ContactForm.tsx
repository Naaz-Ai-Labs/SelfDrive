"use client";

import { useState } from "react";
import { submitEnquiry } from "@/lib/enquiry-actions";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  function validate() {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Please enter your name.";
    if (!/^[+\d][\d\s-]{8,14}$/.test(form.phone.trim())) next.phone = "Enter a valid mobile number.";
    if (form.message.trim().length < 10) next.message = "Tell us a little more (at least 10 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("saving");
    try {
      const res = await submitEnquiry({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        source: "Contact form",
        notes: form.message.trim(),
      });
      if (!res.ok) { setStatus("error"); return; }
      setStatus("done");
      setResult(`Thank you, ${form.name.trim().split(" ")[0]}! Your enquiry ID is ${res.enquiryNo}. We'll get back to you shortly.`);
      setForm({ name: "", phone: "", email: "", message: "" });
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="card flex flex-col items-start gap-3 p-8" role="status">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <h2 className="font-display text-xl font-semibold text-ink-900">Message received</h2>
        <p className="text-sm text-ink-600">{result}</p>
        <button type="button" className="btn-secondary mt-2" onClick={() => setStatus("idle")}>Send another message</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card space-y-5 p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cf-name">Your name *</label>
          <input
            id="cf-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
            autoComplete="name"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="field-error" role="alert">{errors.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="cf-phone">Mobile number *</label>
          <input
            id="cf-phone"
            className="input"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
          />
          {errors.phone && <p className="field-error" role="alert">{errors.phone}</p>}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="cf-email">Email (optional)</label>
        <input
          id="cf-email"
          className="input"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="label" htmlFor="cf-message">How can we help? *</label>
        <textarea
          id="cf-message"
          className="input min-h-28"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Vehicle type, pickup/return dates, any questions…"
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="field-error" role="alert">{errors.message}</p>}
      </div>
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={status === "saving"}>
        {status === "saving" ? "Sending…" : "Send message"}
      </button>
      {status === "error" && (
        <p className="field-error" role="alert">Something went wrong. Please try again or call us directly.</p>
      )}
    </form>
  );
}
