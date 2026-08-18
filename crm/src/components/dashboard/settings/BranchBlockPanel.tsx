"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchBlocked } from "@/lib/actions";

export type BranchRow = {
  id: number;
  name: string;
  city: string | null;
  blocked: number;
  vehicle_count: number;
};

/**
 * Takes a branch in or out of service.
 *
 * Blocking a branch zeroes availability for every vehicle parked there: the public
 * cards grey out and the database refuses the reservation. Nothing on the vehicles
 * is modified, so unblocking restores each one's previous state — a vehicle already
 * in maintenance stays in maintenance.
 *
 * Admin-only. The server action re-checks the role; this component only decides
 * what to draw.
 */
export function BranchBlockPanel({ branches, isAdmin }: { branches: BranchRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function toggle(branch: BranchRow) {
    const blocking = branch.blocked !== 1;
    if (blocking && !confirm(
      `Block ${branch.name}?\n\nAll ${branch.vehicle_count} vehicle(s) there will stop accepting new bookings and will show as unavailable on the website. Existing bookings are not affected.`
    )) return;

    setError("");
    setBusyId(branch.id);
    startTransition(async () => {
      const res = await setBranchBlocked(branch.id, blocking);
      setBusyId(null);
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="card p-5">
      <div className="border-b border-ink-100 pb-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">Branch availability</h2>
        <p className="text-xs text-ink-500">
          Blocking a branch stops new bookings for every vehicle parked there and greys them out on
          the website. Existing bookings are unaffected.
        </p>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <ul className="mt-4 divide-y divide-ink-50">
        {branches.length === 0 && <li className="py-3 text-sm text-ink-400">No branches configured.</li>}
        {branches.map((b) => {
          const isBlocked = b.blocked === 1;
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-ink-900">
                  {b.name}
                  {isBlocked && (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                      Blocked
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-500">
                  {b.city ?? "—"} · {b.vehicle_count} vehicle{b.vehicle_count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                disabled={!isAdmin || (pending && busyId === b.id)}
                onClick={() => toggle(b)}
                title={isAdmin ? undefined : "Admin access is required"}
                className={`btn-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  isBlocked ? "text-emerald-700 border-emerald-200" : "text-red-700 border-red-200"
                }`}
              >
                {pending && busyId === b.id ? "…" : isBlocked ? "Unblock branch" : "Block branch"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
