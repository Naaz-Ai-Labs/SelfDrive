"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVehicleFleetAllocations } from "@/lib/actions";
import type { Vehicle, Branch, VehicleUnit } from "@/lib/data";

export function VehicleReallocateModal({
  vehicles,
  branches,
  units,
  initialVehicleId,
  onClose,
}: {
  vehicles: Vehicle[];
  branches: Branch[];
  units: VehicleUnit[];
  initialVehicleId?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(
    initialVehicleId || vehicles[0]?.id || 1
  );

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];
  const vehicleUnits = units.filter((u) => u.vehicle_id === selectedVehicle?.id);
  const totalUnits = Number(selectedVehicle?.total_units) || vehicleUnits.length || 1;

  // Compute current branch distribution
  const [allocations, setAllocations] = useState<Record<number, number>>(() => {
    const initialMap: Record<number, number> = {};
    for (const b of branches) {
      const count = vehicleUnits.filter((u) => u.current_branch_id === b.id).length;
      initialMap[b.id] = count;
    }
    return initialMap;
  });

  const [effectiveDate, setEffectiveDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState<string>("Fleet redistribution re-balance");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  // When vehicle selection changes, recalculate initial branch counts
  function handleVehicleChange(vId: number) {
    setSelectedVehicleId(vId);
    const targetUnits = units.filter((u) => u.vehicle_id === vId);
    const newMap: Record<number, number> = {};
    for (const b of branches) {
      const count = targetUnits.filter((u) => u.current_branch_id === b.id).length;
      newMap[b.id] = count;
    }
    setAllocations(newMap);
    setError("");
  }

  const assignedSum = Object.values(allocations).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  const unallocatedCount = Math.max(0, totalUnits - assignedSum);
  const isOverAllocated = assignedSum > totalUnits;

  function handleQtyChange(branchId: number, val: number) {
    setAllocations((prev) => ({
      ...prev,
      [branchId]: Math.max(0, val),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isOverAllocated) {
      setError(`Allocated units (${assignedSum}) cannot exceed total units (${totalUnits}).`);
      return;
    }
    setError("");

    startTransition(async () => {
      try {
        const payload = Object.entries(allocations).map(([bId, qty]) => ({
          branchId: Number(bId),
          quantity: Number(qty) || 0,
        }));

        const res = await updateVehicleFleetAllocations({
          vehicleId: selectedVehicle.id,
          branchAllocations: payload,
          effectiveDate: new Date(effectiveDate).toISOString(),
          reason: reason.trim() || undefined,
        });

        if (res.ok) {
          setSuccess(true);
          router.refresh();
          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setError(res.error || "Failed to update fleet allocations.");
        }
      } catch (err: any) {
        setError(err?.message || "Could not complete allocation update.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink-900 flex items-center gap-1.5">
              <span className="text-amber-500">⚡</span> Quick Re-Allocate Fleet by Branch
            </h3>
            <p className="text-xs text-ink-500">
              Distribute total inventory units across branches with instant live sync & plate tracking
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
            <span className="text-2xl">✅</span>
            <p className="text-sm font-bold text-emerald-900">
              Fleet Allocations Updated Successfully!
            </p>
            <p className="text-xs text-emerald-700">
              All physical units, schedules, plate records, and daily availability matrices are in sync.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700 font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="label font-semibold text-ink-900">Select Vehicle Model & Registration *</label>
              <select
                className="input font-semibold text-xs"
                value={selectedVehicleId}
                onChange={(e) => handleVehicleChange(Number(e.target.value))}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} • {v.registration_no || "Plate Unassigned"} ({v.total_units} Total Units)
                  </option>
                ))}
              </select>
            </div>

            {/* Vehicle Number Plate & Units Tracker Banner */}
            <div className="rounded-xl bg-brand-50/50 border border-brand-200 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-900">Vehicle Model</span>
                  <p className="text-sm font-bold text-ink-950">{selectedVehicle?.name}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-900">Primary Number Plate</span>
                  <div className="mt-0.5">
                    <span className="inline-flex items-center rounded-md bg-white px-2.5 py-0.5 font-mono text-xs font-black text-ink-900 border border-brand-300 shadow-2xs">
                      🚗 {selectedVehicle?.registration_no || "Unassigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Physical Units & Plate Chips */}
              {vehicleUnits.length > 0 && (
                <div className="border-t border-brand-200/60 pt-2 space-y-1.5">
                  <p className="text-[11px] font-semibold text-ink-700">
                    Physical Units & Assigned Number Plates ({vehicleUnits.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {vehicleUnits.map((u) => (
                      <div
                        key={u.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] shadow-2xs"
                      >
                        <span className="font-mono font-bold text-brand-700">{u.unit_identifier}</span>
                        <span className="font-mono font-semibold text-ink-900">
                          {u.registration_no || selectedVehicle?.registration_no || "No Plate"}
                        </span>
                        <span className="text-[10px] text-ink-500">
                          ({u.current_branch_name || "Unallocated"})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inventory Pool Bar */}
            <div className="rounded-xl bg-ink-50 p-3.5 border border-ink-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-700">Total Fleet Units:</span>
                <span className="font-mono font-bold text-ink-950 text-sm">{totalUnits}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink-600">Assigned across branches:</span>
                <span className={`font-mono font-bold ${isOverAllocated ? "text-rose-700 font-black" : "text-emerald-700"}`}>
                  {assignedSum} / {totalUnits}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-ink-200/60 pt-1.5">
                <span className="font-medium text-ink-500">Unallocated / Reserve units:</span>
                <span className="font-mono font-semibold text-ink-700">{unallocatedCount}</span>
              </div>
            </div>

            {/* Branch Quantity Distribution Form */}
            <div className="space-y-2.5">
              <label className="label font-semibold text-ink-900">
                Branch Distribution Quantities
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {branches.map((b) => {
                  const qty = allocations[b.id] ?? 0;
                  const branchUnits = vehicleUnits.filter((u) => u.current_branch_id === b.id);

                  return (
                    <div
                      key={b.id}
                      className="flex flex-col justify-between rounded-xl border border-ink-200 bg-white p-3 shadow-2xs hover:border-brand-300 transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-ink-900">{b.name}</p>
                          <p className="text-[10px] text-ink-400">{b.city || "Branch"}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(b.id, qty - 1)}
                            disabled={qty <= 0}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 font-bold text-ink-700 hover:bg-ink-200 disabled:opacity-40"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={totalUnits}
                            value={qty}
                            onChange={(e) => handleQtyChange(b.id, Number(e.target.value))}
                            className="w-12 rounded-lg border border-ink-200 py-1 text-center font-mono font-bold text-ink-900"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(b.id, qty + 1)}
                            disabled={assignedSum >= totalUnits}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 font-bold text-ink-700 hover:bg-ink-200 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Stationed unit plate tags */}
                      {branchUnits.length > 0 && (
                        <div className="flex flex-wrap gap-1 border-t border-ink-100 pt-1.5">
                          {branchUnits.map((u) => (
                            <span
                              key={u.id}
                              className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-800"
                            >
                              🚗 {u.registration_no || selectedVehicle?.registration_no || u.unit_identifier}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Effective Date & Time *</label>
                <input
                  type="datetime-local"
                  className="input font-medium"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Weekend surge allocation"
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs"
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary text-xs font-semibold"
                disabled={pending || isOverAllocated}
              >
                {pending ? "Updating Allocations..." : "💾 Save Fleet Allocation"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
