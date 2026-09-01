"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatINR } from "@/lib/utils";
import { blockVehicleDates, unblockVehicleDates } from "@/lib/actions";
import { istDateKey } from "@/lib/rental-clock";

type VehicleItem = {
  id: number;
  name: string;
  category: string;
  totalUnits: number;
  availableUnits: number;
  status: string;
  rate24h: number;
};

type BookingBlock = {
  id: number;
  bookingNo: string;
  customerName: string;
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  status: string;
};

/** A staff-created hold (not a customer booking) — the thing blockVehicleDates writes. */
type StaffBlock = {
  id: number;
  vehicleId: number;
  vehicleUnitId: number | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  notes: string | null;
};

/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Not toISOString().slice(0,10): that converts to UTC first, so local midnight in IST
 * (UTC+5:30) becomes 18:30 the PREVIOUS day and every cell was compared against the
 * wrong date. Bookings appeared shifted one column left near midnight.
 */
function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Midnight-to-midnight IST bounds for a day, as the timestamptz strings the API wants. */
function istDayBounds(dayKey: string): { startsAt: string; endsAt: string } {
  return { startsAt: `${dayKey}T00:00:00+05:30`, endsAt: `${dayKey}T23:59:59+05:30` };
}

const WINDOW_OPTIONS = [7, 14, 30] as const;

export function FleetGanttCalendar({
  vehicles = [],
  bookings = [],
  blocks = [],
}: {
  vehicles?: VehicleItem[];
  bookings?: BookingBlock[];
  /** Optional and defaulted so any existing caller that doesn't pass it is unaffected. */
  blocks?: StaffBlock[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [hoveredBooking, setHoveredBooking] = useState<BookingBlock | null>(null);

  // Timeline window. `anchorKey` is the first day shown; `windowDays` how many follow.
  // Both are state so staff can walk forward through the month instead of being stuck
  // on a fixed week starting yesterday.
  const today = new Date();
  const [anchorKey, setAnchorKey] = useState<string>(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    return localDayKey(d);
  });
  const [windowDays, setWindowDays] = useState<number>(7);

  /** Cell awaiting an action, or null when the menu is closed. */
  const [actionCell, setActionCell] = useState<{ vehicle: VehicleItem; dayKey: string } | null>(null);
  const [error, setError] = useState("");

  const anchor = new Date(`${anchorKey}T00:00:00`);
  const days: Date[] = [];
  for (let i = 0; i < windowDays; i++) {
    days.push(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i));
  }

  const todayKey = localDayKey(today);

  function shiftWindow(deltaDays: number) {
    const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + deltaDays);
    setAnchorKey(localDayKey(next));
  }

  const categories = Array.from(new Set(vehicles.map((v) => v.category))).filter(Boolean);
  const filteredVehicles = vehicles.filter(
    (v) => selectedCategory === "all" || v.category === selectedCategory
  );

  function getStatusColor(status: string) {
    switch (status) {
      case "Active rental":
      case "Vehicle handed over":
        return "bg-emerald-500 text-white border-emerald-600";
      case "Confirmed":
        return "bg-amber-500 text-white border-amber-600";
      case "Pending verification":
        return "bg-purple-500 text-white border-purple-600";
      default:
        return "bg-blue-500 text-white border-blue-600";
    }
  }

  /** Every booking/block on this vehicle overlapping this specific day — not just the
   * one a cell's own single-match display picks — so both the "free day" and the
   * "booking day" popups can show the true count. Pure/local: takes the already
   * per-vehicle-filtered arrays, doesn't touch component state. */
  function dayOccupancy(vBookings: BookingBlock[], vBlocks: StaffBlock[], dayKey: string, totalUnits: number) {
    const dayBookings = vBookings.filter((b) => {
      const pickupDay = istDateKey(new Date(b.pickupAt));
      const returnDay = istDateKey(new Date(b.returnAt));
      return dayKey >= pickupDay && dayKey <= returnDay;
    });
    const dayBlocks = vBlocks.filter((b) => {
      const startDay = istDateKey(new Date(b.startsAt));
      const endDay = istDateKey(new Date(b.endsAt));
      return dayKey >= startDay && dayKey <= endDay;
    });
    return { dayBookings, dayBlocks, available: Math.max(0, totalUnits - dayBookings.length - dayBlocks.length) };
  }

  function handleBlockDay(vehicle: VehicleItem, dayKey: string) {
    setError("");
    const { startsAt, endsAt } = istDayBounds(dayKey);
    startTransition(async () => {
      const res = await blockVehicleDates({
        vehicleId: vehicle.id,
        startsAt,
        endsAt,
        // Must be one of the three values the DB check constraint allows; the
        // descriptive text goes in notes, which is unconstrained.
        reason: "manual_block",
        notes: `Blocked from fleet timeline on ${dayKey}`,
      });
      if (!res.ok) {
        setError(res.error || "Could not block that date.");
        return;
      }
      setActionCell(null);
      router.refresh();
    });
  }

  function handleUnblock(blockId: number) {
    setError("");
    startTransition(async () => {
      const res = await unblockVehicleDates(blockId);
      if (!res.ok) {
        setError(res.error || "Could not lift that block.");
        return;
      }
      router.refresh();
    });
  }

  // Column template: a fixed name column, then one equal column per day. The old
  // `grid-cols-8` was hard-coded to a 7-day window and broke as soon as the window
  // became adjustable.
  const gridStyle = { gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${windowDays}, minmax(76px, 1fr))` };

  return (
    <div className="card p-6 space-y-4 shadow-sm border border-ink-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Interactive Fleet Gantt Timeline Schedule
            </h2>
            <span className="badge bg-emerald-100 text-emerald-800 font-semibold">Live Fleet Matrix</span>
          </div>
          <p className="text-xs text-ink-500">
            Click a rental to open it. Click any free day to block it or take an offline booking.
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
              selectedCategory === "all" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            All Categories ({vehicles.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                selectedCategory === cat ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/50 px-3 py-2">
        <button type="button" onClick={() => shiftWindow(-windowDays)} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50">
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => setAnchorKey(localDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)))}
          className="rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100"
        >
          Today
        </button>
        <button type="button" onClick={() => shiftWindow(windowDays)} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50">
          Next →
        </button>

        <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-600">
          Jump to
          <input
            type="date"
            value={anchorKey}
            onChange={(e) => e.target.value && setAnchorKey(e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
          />
        </label>

        <div className="ml-auto flex items-center gap-1">
          {WINDOW_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setWindowDays(n)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                windowDays === n ? "bg-ink-900 text-white" : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</p>
      )}

      {/* Hovered booking detail. Chips are links now, so this is a convenience, not the
          only route to the booking. */}
      <div className="min-h-[48px] rounded-xl border border-brand-200 bg-brand-50/40 p-3 text-xs flex items-center justify-between gap-2 transition-all">
        {hoveredBooking ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-ink-900 bg-brand-100 px-2 py-0.5 rounded font-mono text-[11px]">
                {hoveredBooking.bookingNo}
              </span>
              <span>Customer: <strong className="text-ink-900">{hoveredBooking.customerName}</strong></span>
              <span className="text-ink-400">•</span>
              <span>Schedule: <span className="font-mono text-ink-700">{hoveredBooking.pickupAt.slice(0, 16)} → {hoveredBooking.returnAt.slice(0, 16)}</span></span>
            </div>
            <Link href={`/dashboard/bookings/${hoveredBooking.id}`} className="btn-primary px-3 py-1 text-[11px] shrink-0 font-semibold shadow-xs">
              View Booking →
            </Link>
          </>
        ) : (
          <div className="text-ink-500 text-xs flex items-center gap-2">
            <span className="text-sm">💡</span>
            <span>Click a customer block to open that booking, or a free day to block it.</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: `${150 + windowDays * 76}px` }}>
          <div className="grid border-b border-ink-200 bg-ink-50/60 pb-2 pt-2 text-xs font-bold text-ink-700" style={gridStyle}>
            <div className="px-3">Vehicle / Fleet</div>
            {days.map((d) => {
              const key = localDayKey(d);
              return (
                <div key={key} className={`text-center py-1 rounded-md ${key === todayKey ? "bg-brand-500/20 text-brand-900 font-extrabold" : ""}`}>
                  <span className="block text-[10px] uppercase text-ink-400">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span>{d.getDate()} {d.toLocaleDateString("en-US", { month: "short" })}</span>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-ink-100">
            {filteredVehicles.map((v) => {
              const vBookings = bookings.filter((b) => b.vehicleId === v.id);
              const vBlocks = blocks.filter((b) => b.vehicleId === v.id);

              return (
                <div key={v.id} className="grid items-center py-2.5 hover:bg-ink-50/40" style={gridStyle}>
                  <div className="px-3 min-w-0">
                    <Link href={`/dashboard/vehicles/${v.id}`} className="font-bold text-xs text-ink-900 hover:text-brand-700 truncate block">
                      {v.name}
                    </Link>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                      <span className="text-ink-500">{formatINR(v.rate24h)}/24h</span> •{" "}
                      {v.availableUnits === 0 ? (
                        <span className="font-bold text-rose-700">0/{v.totalUnits} Unavailable</span>
                      ) : (
                        <span className="font-semibold text-emerald-700">{v.availableUnits}/{v.totalUnits} Units</span>
                      )}
                    </div>
                  </div>

                  {days.map((d) => {
                    const dayKey = localDayKey(d);
                    // b.pickupAt / b.startsAt arrive from PostgREST as UTC ("...+00:00"),
                    // never IST. .slice(0,10) on that string reads the UTC calendar date,
                    // which is a day EARLIER than the intended IST day for any time before
                    // 05:30 IST — every 24h IST-anchored block (00:00-23:59:59 IST) starts
                    // at 18:30 UTC the day before, so it always spanned two date-string
                    // days instead of one. Blocking the 28th visibly "spilled" onto the
                    // 27th too. istDateKey() reads the instant's true IST calendar day
                    // regardless of which UTC date the server happened to serialize.
                    const matchingBooking = vBookings.find((b) => {
                      const pickupDay = istDateKey(new Date(b.pickupAt));
                      const returnDay = istDateKey(new Date(b.returnAt));
                      return dayKey >= pickupDay && dayKey <= returnDay;
                    });
                    // A booking on this vehicle always wins the cell over a block: it is
                    // real revenue, and blockVehicleDates only ever writes a row with no
                    // booking_id, so the two can never actually describe the same hold.
                    const matchingBlock = !matchingBooking
                      ? vBlocks.find((b) => {
                          const startDay = istDateKey(new Date(b.startsAt));
                          const endDay = istDateKey(new Date(b.endsAt));
                          return dayKey >= startDay && dayKey <= endDay;
                        })
                      : undefined;
                    const isOpen = actionCell?.vehicle.id === v.id && actionCell?.dayKey === dayKey;

                    return (
                      <div key={dayKey} className="px-1 text-center relative">
                        {matchingBooking ? (
                          // Opens the same kind of dropdown a free day does, rather than
                          // navigating straight to the booking — this day can have more
                          // than one booking on it (one per unit), and the cell's own
                          // single-match display only ever picked the first. The dropdown
                          // lists every booking on this day; picking one is what now
                          // navigates to it. Backward compatible: the single-booking case
                          // (by far the common one) still reaches the same booking page,
                          // just one click later, and the hover preview is unchanged.
                          <>
                            <button
                              type="button"
                              onMouseEnter={() => setHoveredBooking(matchingBooking)}
                              onMouseLeave={() => setHoveredBooking(null)}
                              onClick={() => { setError(""); setActionCell(isOpen ? null : { vehicle: v, dayKey }); }}
                              title={`${matchingBooking.bookingNo} · ${matchingBooking.customerName} · click for options`}
                              className={`block w-full rounded-lg px-1.5 py-1 text-[10px] font-bold truncate border shadow-xs cursor-pointer transition-all hover:brightness-110 hover:shadow-md ${getStatusColor(matchingBooking.status)}`}
                            >
                              {matchingBooking.customerName.split(" ")[0]}
                            </button>

                            {isOpen && (() => {
                              const { dayBookings, available: dayAvailable } = dayOccupancy(vBookings, vBlocks, dayKey, v.totalUnits);

                              return (
                                <div className="absolute z-20 mt-1 left-1/2 -translate-x-1/2 w-56 rounded-xl border border-ink-200 bg-white p-1.5 text-left shadow-lg">
                                  <p className="px-2 py-1 text-[10px] font-semibold text-ink-500">
                                    {v.name} · {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  </p>
                                  {dayBookings.map((b) => (
                                    <Link
                                      key={b.id}
                                      href={`/dashboard/bookings/${b.id}`}
                                      className="block w-full truncate rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-800 hover:bg-ink-50"
                                    >
                                      📄 {b.customerName} · {b.bookingNo}
                                    </Link>
                                  ))}
                                  <Link
                                    href={`/dashboard/bookings?new=1&vehicleId=${v.id}&pickup=${dayKey}`}
                                    className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-800 hover:bg-ink-50"
                                  >
                                    📝 Offline booking
                                  </Link>
                                  <Link
                                    href={`/dashboard/fleet/blocking?vehicleId=${v.id}`}
                                    className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                                  >
                                    📅 Block a range…
                                  </Link>
                                  <Link
                                    href={`/dashboard/vehicles/${v.id}`}
                                    className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
                                  >
                                    🔧 Manage units
                                  </Link>
                                  <p className={`mt-0.5 border-t border-ink-100 px-2 pt-1.5 text-[10px] font-semibold ${dayAvailable > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    📊 {dayAvailable}/{v.totalUnits} units available on {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setActionCell(null)}
                                    className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-ink-400 hover:bg-ink-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              );
                            })()}
                          </>
                        ) : matchingBlock ? (
                          // A staff block. Its own cell, distinct from a paid booking, so
                          // "block a day" is visible on the very screen that created it —
                          // previously the write succeeded but nothing rendered it here.
                          <button
                            type="button"
                            disabled={isPending}
                            title={matchingBlock.notes || matchingBlock.reason}
                            onClick={() => handleUnblock(matchingBlock.id)}
                            className="block h-6 w-full rounded-lg border border-rose-300 bg-rose-100 px-1.5 text-[10px] font-bold text-rose-800 truncate transition hover:bg-rose-200 disabled:opacity-50"
                          >
                            {isPending ? "…" : matchingBlock.reason === "maintenance" ? "🔧 Blocked" : "🚫 Blocked"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setError(""); setActionCell(isOpen ? null : { vehicle: v, dayKey }); }}
                              className={`h-6 w-full rounded text-[10px] transition ${
                                isOpen ? "bg-brand-200 text-brand-900 font-semibold" : "bg-ink-100/40 text-ink-300 hover:bg-emerald-100/60 hover:text-emerald-800"
                              }`}
                            >
                              {isOpen ? "Choose…" : "Available"}
                            </button>

                            {isOpen && (() => {
                              const { available: dayAvailable } = dayOccupancy(vBookings, vBlocks, dayKey, v.totalUnits);

                              return (
                              <div className="absolute z-20 mt-1 left-1/2 -translate-x-1/2 w-48 rounded-xl border border-ink-200 bg-white p-1.5 text-left shadow-lg">
                                <p className="px-2 py-1 text-[10px] font-semibold text-ink-500">
                                  {v.name} · {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                </p>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleBlockDay(v, dayKey)}
                                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  {isPending ? "Blocking…" : "🚫 Block this day"}
                                </button>
                                <Link
                                  href={`/dashboard/bookings?new=1&vehicleId=${v.id}&pickup=${dayKey}`}
                                  className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-800 hover:bg-ink-50"
                                >
                                  📝 Offline booking
                                </Link>
                                <Link
                                  href={`/dashboard/fleet/blocking?vehicleId=${v.id}`}
                                  className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  📅 Block a range…
                                </Link>
                                <Link
                                  href={`/dashboard/vehicles/${v.id}`}
                                  className="block w-full rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
                                >
                                  🔧 Manage units
                                </Link>
                                <p className={`mt-0.5 border-t border-ink-100 px-2 pt-1.5 text-[10px] font-semibold ${dayAvailable > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                  📊 {dayAvailable}/{v.totalUnits} units available on {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setActionCell(null)}
                                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-ink-400 hover:bg-ink-50"
                                >
                                  Cancel
                                </button>
                              </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
