"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BookingBar({ categories }: { categories: { id: number; name: string; kind: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [pickupDate, setPickupDate] = useState(today);
  const [returnDate, setReturnDate] = useState(today);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (kind) params.set("kind", kind);
        if (pickupDate) params.set("pickup", pickupDate);
        if (returnDate) params.set("return", returnDate);
        router.push(`/vehicles?${params.toString()}`);
      }}
      className="grid gap-4 rounded-2xl border border-white/15 bg-ink-950/70 p-4 shadow-lift backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end lg:p-5"
      aria-label="Search available vehicles"
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Vehicle type</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [&>option]:bg-ink-900 [&>option]:text-white"
        >
          <option value="">Any type</option>
          {Array.from(new Map(categories.map((c) => [c.kind, c])).values()).map((c) => (
            <option key={c.kind} value={c.kind}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Pickup date</span>
        <input
          type="date"
          value={pickupDate}
          min={today}
          onChange={(e) => setPickupDate(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [color-scheme:dark]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Return date</span>
        <input
          type="date"
          value={returnDate}
          min={pickupDate}
          onChange={(e) => setReturnDate(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [color-scheme:dark]"
        />
      </label>

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold uppercase tracking-wider text-ink-950 shadow-lift transition hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 active:scale-[0.98]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Search available vehicles
      </button>
    </form>
  );
}
