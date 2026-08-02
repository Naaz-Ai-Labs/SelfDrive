"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessInfo } from "@/lib/actions";

export function BusinessForm({ initial, isAdmin }: { initial: Record<string, unknown>; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const social = (initial.social as Record<string, string>) ?? {};
  const [form, setForm] = useState({
    name: String(initial.name ?? ""),
    tagline: String(initial.tagline ?? ""),
    phone: String(initial.phone ?? ""),
    whatsapp: String(initial.whatsapp ?? ""),
    email: String(initial.email ?? ""),
    address: String(initial.address ?? ""),
    city: String(initial.city ?? ""),
    hours: String(initial.hours ?? ""),
    instagram: String(social.instagram ?? ""),
    facebook: String(social.facebook ?? ""),
    youtube: String(social.youtube ?? ""),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await saveBusinessInfo({
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        hours: form.hours.trim(),
        social: { instagram: form.instagram, facebook: form.facebook, youtube: form.youtube },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <p className="text-sm text-ink-600">
          <strong>{form.name}</strong> · {form.tagline}
          <br />{form.phone} · {form.email} · {form.city}
        </p>
        <p className="mt-3 text-xs text-ink-400">Ask an administrator to make changes.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bi-name">Business name</label>
          <input id="bi-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bi-tagline">Tagline</label>
          <input id="bi-tagline" className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bi-phone">Phone</label>
          <input id="bi-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bi-wa">WhatsApp number</label>
          <input id="bi-wa" className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bi-email">Email</label>
          <input id="bi-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bi-address">Address</label>
          <input id="bi-address" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bi-city">City</label>
          <input id="bi-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bi-hours">Business hours</label>
          <input id="bi-hours" className="input" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        </div>
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Social links</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="bi-ig">Instagram</label>
          <input id="bi-ig" className="input" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="https://…" />
        </div>
        <div>
          <label className="label" htmlFor="bi-fb">Facebook</label>
          <input id="bi-fb" className="input" value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} placeholder="https://…" />
        </div>
        <div>
          <label className="label" htmlFor="bi-yt">YouTube</label>
          <input id="bi-yt" className="input" value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} placeholder="https://…" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save business info"}</button>
        {saved && <span className="text-sm font-medium text-emerald-700">Saved ✓</span>}
      </div>
      <p className="text-xs text-ink-400">Note: WhatsApp number is used for the "WhatsApp us" buttons across the website.</p>
    </form>
  );
}
