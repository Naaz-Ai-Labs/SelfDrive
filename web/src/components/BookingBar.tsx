"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const value = `${String(i).padStart(2, "0")}:00`;
  const ampm = i >= 12 ? "PM" : "AM";
  const h12 = i % 12 === 0 ? 12 : i % 12;
  const label = `${h12}:00 ${ampm}`;
  return { value, label };
});

export function BookingBar({
  categories,
  initialValues,
}: {
  categories: { id: number; name: string; kind: string }[];
  initialValues?: { kind?: string; pickup?: string; pickupTime?: string; return?: string; returnTime?: string };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState(initialValues?.kind ?? "");
  const [pickupDate, setPickupDate] = useState(initialValues?.pickup ?? today);
  const [pickupTime, setPickupTime] = useState(initialValues?.pickupTime ?? "08:00");
  const initialRetDate = initialValues?.return ?? today;
  const isInitialSunday = (() => {
    if (!initialRetDate) return false;
    const parts = initialRetDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    const d = parts[0] > 1000 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(parts[2], parts[1] - 1, parts[0]);
    return d.getDay() === 0;
  })();

  const [returnDate, setReturnDate] = useState(initialRetDate);
  const [returnTime, setReturnTime] = useState(initialValues?.returnTime ?? (isInitialSunday ? "09:00" : "08:00"));

  const isSundayReturn = (() => {
    if (!returnDate) return false;
    const parts = returnDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    const d = parts[0] > 1000 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(parts[2], parts[1] - 1, parts[0]);
    return d.getDay() === 0;
  })();

  const handleReturnDateChange = (newDate: string) => {
    setReturnDate(newDate);
    const parts = newDate.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const d = parts[0] > 1000 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(parts[2], parts[1] - 1, parts[0]);
      if (d.getDay() === 0 && returnTime === "08:00") {
        setReturnTime("09:00");
      } else if (d.getDay() !== 0 && returnTime === "09:00") {
        setReturnTime("08:00");
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (kind) params.set("kind", kind);
        if (pickupDate) params.set("pickup", pickupDate);
        if (pickupTime) params.set("pickupTime", pickupTime);
        if (returnDate) params.set("return", returnDate);
        if (returnTime) params.set("returnTime", returnTime);
        // Cache search context so BookingForm can read it reliably
        try {
          sessionStorage.setItem("darshh_search_context", JSON.stringify({ pickupDate, pickupTime, returnDate, returnTime, kind }));
        } catch {}
        router.push(`/vehicles?${params.toString()}`);
      }}
      className="grid gap-4 rounded-2xl border border-white/15 bg-ink-950/70 p-4 shadow-lift backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-5 lg:items-end lg:p-5"
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

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Pickup date</span>
          <input
            type="date"
            value={pickupDate}
            min={today}
            onChange={(e) => setPickupDate(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [color-scheme:dark]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Pickup time</span>
          <select
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [&>option]:bg-ink-900 [&>option]:text-white"
          >
            {TIME_SLOTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value === "08:00" ? "8:00 AM (Standard)" : t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
            Drop date {isSundayReturn && <span className="text-amber-400">(Sunday)</span>}
          </span>
          <input
            type="date"
            value={returnDate}
            min={pickupDate}
            onChange={(e) => handleReturnDateChange(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [color-scheme:dark]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Drop time</span>
          <select
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [&>option]:bg-ink-900 [&>option]:text-white"
          >
            {TIME_SLOTS.map((t) => {
              const isStdSun = isSundayReturn && t.value === "09:00";
              const isStdWk = !isSundayReturn && t.value === "08:00";
              return (
                <option key={t.value} value={t.value}>
                  {isStdSun ? "9:00 AM (Standard Sunday)" : isStdWk ? "8:00 AM (Standard)" : t.label}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="sm:col-span-2 lg:col-span-2">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink-950 shadow-lift transition hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 active:scale-[0.98]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search available vehicles
        </button>
      </div>
    </form>
  );
}
