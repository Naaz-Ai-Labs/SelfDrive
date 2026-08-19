"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferVehicleUnit } from "@/lib/actions";
import type { VehicleUnit, Branch } from "@/lib/data";

export function BranchTransferModal({
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
  const [targetBranchId, setTargetBranchId] = useState<number>(
    branches.find((b) => b.id !== unit.current_branch_id)?.id || branches[0]?.id || 1
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!targetBranchId) {
      setError("Please select a target branch.");
      return;
    }
    if (targetBranchId === unit.current_branch_id) {
      setError("Target branch must be different from current branch.");
      return;
    }
    setError("");

    startTransition(async () => {
      try {
        const res = await transferVehicleUnit({
          unitId: unit.id,
          toBranchId: targetBranchId,
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
          setError(res.error || "Failed to transfer unit.");
        }
      } catch (err: any) {
        setError(err?.message || "Could not complete branch transfer.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink-900">
              Transfer Vehicle Unit
            </h3>
            <p className="text-xs text-ink-500">
              Move physical unit between branches with audit history
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
            <p className="text-sm font-semibold text-emerald-800">
              Unit {unit.unit_identifier} Transferred!
            </p>
            <p className="text-xs text-emerald-600">
              Branch allocation and transfer records updated.
            </p>
          </div>
        ) : (
          <form onSubmit={handleTransfer} className="space-y-4 text-xs">
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700 font-medium">
                {error}
              </div>
            )}

            <div className="rounded-xl bg-ink-50 p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-500 font-medium">Unit Identifier:</span>
                <span className="font-bold text-ink-900">{unit.unit_identifier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500 font-medium">Vehicle Model:</span>
                <span className="text-ink-800">{unit.vehicle_name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500 font-medium">Current Branch:</span>
                <span className="font-semibold text-ink-700">
                  {unit.current_branch_name || "Unallocated"}
                </span>
              </div>
            </div>

            <div>
              <label className="label">Transfer to Branch *</label>
              <select
                className="input font-medium"
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(Number(e.target.value))}
              >
                {branches
                  .filter((b) => b.id !== unit.current_branch_id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city || "Branch"})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="label">Effective Transfer Date & Time *</label>
              <input
                type="datetime-local"
                className="input font-medium"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Reason / Transfer Notes</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Weekend demand rebalance"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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
                className="btn-primary text-xs"
                disabled={pending}
              >
                {pending ? "Transferring Unit..." : "Confirm Transfer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
