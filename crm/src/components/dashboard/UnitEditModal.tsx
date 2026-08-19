"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVehicleUnitDetails } from "@/lib/actions";
import type { VehicleUnit, Branch } from "@/lib/data";

export function UnitEditModal({
  unit,
  branches,
  onClose,
}: {
  unit: VehicleUnit;
  branches: Branch[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [registrationNo, setRegistrationNo] = useState(unit.registration_no || "");
  const [status, setStatus] = useState<string>(unit.status || "available");
  const [branchId, setBranchId] = useState<string>(
    unit.current_branch_id ? String(unit.current_branch_id) : ""
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!registrationNo.trim()) {
      setError("Vehicle Plate / Registration Number is required (e.g. KA-46-M-5566).");
      return;
    }
    setError("");

    startTransition(async () => {
      try {
        const res = await updateVehicleUnitDetails({
          unitId: unit.id,
          registrationNo: registrationNo.trim().toUpperCase(),
          status,
          branchId: branchId ? Number(branchId) : null,
          effectiveDate: new Date(effectiveDate).toISOString(),
          notes: notes.trim() || undefined,
        });

        if (res.ok) {
          setSuccess(true);
          router.refresh();
          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setError(res.error || "Failed to update unit details.");
        }
      } catch (err: any) {
        setError(err?.message || "Could not update unit.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink-900">
              ✏️ Edit Physical Vehicle Unit
            </h3>
            <p className="text-xs text-ink-500">
              Update plate registration number, operational status, and branch assignment
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
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-1">
            <span className="text-xl">✅</span>
            <p className="text-sm font-bold text-emerald-900">
              Unit {unit.unit_identifier} Updated!
            </p>
            <p className="text-xs text-emerald-600">
              Plate number, status, and branch records updated.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700 font-medium">
                {error}
              </div>
            )}

            <div className="rounded-xl bg-ink-50 p-3 space-y-1 border border-ink-200/60">
              <div className="flex justify-between">
                <span className="text-ink-500 font-medium">Unit Identifier:</span>
                <span className="font-mono font-bold text-brand-700">{unit.unit_identifier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500 font-medium">Model:</span>
                <span className="font-semibold text-ink-900">{unit.vehicle_name || "—"}</span>
              </div>
            </div>

            <div>
              <label className="label font-semibold text-ink-900">Vehicle Plate / Registration No. *</label>
              <input
                type="text"
                className="input uppercase font-mono font-bold"
                placeholder="e.g. KA-46-M-5566"
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label font-semibold text-ink-900">Assigned Branch</label>
                <select
                  className="input font-medium"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">— Unallocated / Reserve —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city || "Branch"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label font-semibold text-ink-900">Unit Status</label>
                <select
                  className="input font-medium"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="available">Available (Active Fleet)</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="booked">Booked (On Rental)</option>
                  <option value="blocked">Blocked / Hold</option>
                  <option value="transit">In Transit</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label font-semibold text-ink-900">Effective Date & Time *</label>
              <input
                type="datetime-local"
                className="input font-medium"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Update Notes / Reason</label>
              <input
                type="text"
                placeholder="e.g. Routine maintenance or branch swap"
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
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
                disabled={pending}
              >
                {pending ? "Saving..." : "💾 Save Unit Details"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
