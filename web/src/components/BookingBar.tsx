"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { getLiveClockMinPickup, compute25HourAutoReturn } from "@/lib/utils";

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
  initialValues?: { kind?: string; location?: string; pickup?: string; pickupTime?: string; return?: string; returnTime?: string };
}) {
  const router = useRouter();
  
  const { minPickupDate, isTimeDisabled, getValidPickupTime } = useMemo(() => getLiveClockMinPickup(), []);

  const initialPickupDate = initialValues?.pickup ?? minPickupDate;
  const initialPickupTime = initialValues?.pickupTime ?? "08:00";
  
  const initialAutoReturn = compute25HourAutoReturn(initialPickupDate, initialPickupTime);
  const initialReturnDate = initialValues?.return ?? initialAutoReturn.returnDate;
  const initialReturnTime = initialValues?.returnTime ?? initialAutoReturn.returnTime;

  const [kind, setKind] = useState(initialValues?.kind ?? "");
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [pickupDate, setPickupDate] = useState(initialPickupDate);
  const [pickupTime, setPickupTime] = useState(initialPickupTime);
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [returnTime, setReturnTime] = useState(initialReturnTime);

  const isSundayReturn = useMemo(() => {
    if (!returnDate) return false;
    const parts = returnDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    const d = parts[0] > 1000 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(parts[2], parts[1] - 1, parts[0]);
    return d.getDay() === 0;
  }, [returnDate]);

  const handlePickupDateChange = (newDate: string) => {
    const validDate = newDate < minPickupDate ? minPickupDate : newDate;
    setPickupDate(validDate);
    const validTime = getValidPickupTime(pickupTime, validDate);
    setPickupTime(validTime);
    const auto = compute25HourAutoReturn(validDate, validTime);
    setReturnDate(auto.returnDate);
    setReturnTime(auto.returnTime);
  };

  const handlePickupTimeChange = (newTime: string) => {
    const validTime = getValidPickupTime(newTime, pickupDate);
    setPickupTime(validTime);
    const auto = compute25HourAutoReturn(pickupDate, validTime);
    setReturnDate(auto.returnDate);
    setReturnTime(auto.returnTime);
  };

  const handleReturnDateChange = (newDate: string) => {
    setReturnDate(newDate);

    // Switching the drop date onto a Sunday can leave a previously-valid time
    // (07:00, 08:00) selected that is no longer offered — the option disappears
    // from the list but the state keeps it, and the booking submits a time the
    // counter will not accept. Pull it forward to the earliest Sunday slot.
    const parts = newDate.split("-").map(Number);
    const landsOnSunday =
      parts.length === 3 && !parts.some(isNaN) && new Date(parts[0], parts[1] - 1, parts[2]).getDay() === 0;
    if (landsOnSunday && returnTime < "09:00") {
      setReturnTime("09:00");
      return;
    }

    const isSameDay = pickupDate && newDate && pickupDate === newDate;
    if (isSameDay && returnTime <= pickupTime) {
      const validReturnHour = Math.min(23, parseInt(pickupTime.split(":")[0], 10) + 1);
      setReturnTime(`${String(validReturnHour).padStart(2, "0")}:00`);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (kind) params.set("kind", kind);
        if (location) params.set("location", location);
        if (pickupDate) params.set("pickup", pickupDate);
        if (pickupTime) params.set("pickupTime", pickupTime);
        if (returnDate) params.set("return", returnDate);
        if (returnTime) params.set("returnTime", returnTime);
        // Cache search context so BookingForm can read it reliably
        try {
          sessionStorage.setItem("darshh_search_context", JSON.stringify({ pickupDate, pickupTime, returnDate, returnTime, kind, location }));
        } catch {}
        router.push(`/vehicles?${params.toString()}`);
      }}
      className="grid gap-4 rounded-2xl border border-white/15 bg-ink-950/70 p-4 shadow-lift backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-6 lg:items-end lg:p-5"
      aria-label="Search available vehicles"
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Location</span>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [&>option]:bg-ink-900 [&>option]:text-white"
        >
          <option value="">🏢 All Branches</option>
          <option value="SAKLESHPURA">📍 Sakleshpura Branch (KA-46)</option>
          <option value="HASSAN">📍 Hassan Branch (KA-13)</option>
        </select>
      </label>

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
            min={minPickupDate}
            onChange={(e) => handlePickupDateChange(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [color-scheme:dark]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Pickup time</span>
          <select
            value={pickupTime}
            onChange={(e) => handlePickupTimeChange(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-xs text-white shadow-sm transition focus:border-brand-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 [&>option]:bg-ink-900 [&>option]:text-white"
          >
            {TIME_SLOTS.map((t) => {
              const disabled = isTimeDisabled(t.value, pickupDate);
              const isEarly = t.value < "08:00";
              return (
                <option key={t.value} value={t.value} disabled={disabled} className={disabled ? "opacity-30 text-white/30" : ""}>
                  {t.value === "08:00"
                    ? "8:00 AM (Standard)"
                    : isEarly
                    ? `${t.label} (+₹250 Early Pickup)`
                    : t.label} {disabled ? " (Past)" : ""}
                </option>
              );
            })}
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
            {TIME_SLOTS.filter((t) => {
              // Staff won't accept a vehicle return between midnight and 7 AM — no
              // one is on-site to inspect and check it back in overnight. On
              // Sundays the counter opens later still, so nothing before 9 AM.
              const earliestReturn = isSundayReturn ? "09:00" : "07:00";
              if (t.value < earliestReturn) {
                return false;
              }
              const isSameDay = pickupDate && returnDate && pickupDate === returnDate;
              if (isSameDay) {
                return t.value > pickupTime;
              }
              return true;
            }).map((t) => {
              const isSameDay = pickupDate && returnDate && pickupDate === returnDate;
              const isStandard = t.value === "08:00";
              const isLate = !isSameDay && t.value > "08:00";
              return (
                <option key={t.value} value={t.value}>
                  {isStandard
                    ? "8:00 AM (Standard)"
                    : isLate
                    ? `${t.label} (+1 Day Extra Charge)`
                    : t.label}
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
