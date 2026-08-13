"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAfterHours } from "@/lib/actions";
import { formatDateTime } from "@/lib/utils";

export type AfterHoursRequest = {
  id: number;
  booking_no: string;
  customer_name: string | null;
  vehicle_name: string | null;
  pickup_at: string;
};

/**
 * Pending early/late pickup requests waiting on a manager's approve/decline.
 *
 * approveAfterHours() has existed since the initial build, but nothing in the UI
 * ever called it — staff had no screen that showed which bookings needed a
 * decision, only the raw notes field on an individual booking if they happened to
 * open it. This is that missing screen.
 */
export function AfterHoursPanel({ requests }: { requests: AfterHoursRequest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  if (requests.length === 0) return null;

  function decide(id: number, approve: boolean) {
    setError("");
    setBusyId(id);
    startTransition(async () => {
      const res = await approveAfterHours(id, approve);
      setBusyId(null);
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="card p-5 shadow-sm border-l-4 border-l-amber-400">
      <div className="flex items-center justify-between border-b border-ink-100 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">After-hours pickup requests</h2>
          <p className="text-xs text-ink-500">Bookings with a before-8AM or off-schedule pickup, awaiting a decision</p>
        </div>
        <span className="badge bg-amber-100 text-amber-800 font-bold text-[10px]">{requests.length} pending</span>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <ul className="mt-4 divide-y divide-ink-50">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold text-ink-900">
                {r.booking_no} <span className="font-normal text-ink-500">— {r.customer_name ?? "Unknown customer"}</span>
              </p>
              <p className="text-xs text-ink-500">
                {r.vehicle_name ?? "Vehicle TBD"} · Pickup {formatDateTime(r.pickup_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending && busyId === r.id}
                onClick={() => decide(r.id, true)}
                className="btn-secondary px-3 py-1.5 text-xs font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                {pending && busyId === r.id ? "…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={pending && busyId === r.id}
                onClick={() => decide(r.id, false)}
                className="btn-secondary px-3 py-1.5 text-xs font-semibold text-red-700 border-red-200 hover:bg-red-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
