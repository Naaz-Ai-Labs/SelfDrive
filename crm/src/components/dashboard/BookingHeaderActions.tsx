"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickApproveBooking, rejectBooking, reopenBooking } from "@/lib/actions";

const PRESET_REJECTION_REASONS = [
  "Invalid or expired Driving Licence",
  "Aadhaar / ID proof blurred or unreadable",
  "Customer name does not match ID proof",
  "Driver under minimum age requirement (18+ / 21+)",
  "Vehicle unavailable for requested time slot",
  "Customer unreachable / identity unverified",
  "Payment mismatch or verification failure",
  "Other (Specify in notes below)",
];

export function BookingHeaderActions({
  bookingId,
  currentStatus,
  notes,
}: {
  bookingId: number;
  currentStatus: string;
  notes?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reason, setReason] = useState(PRESET_REJECTION_REASONS[0]);
  const [customNotes, setCustomNotes] = useState("");
  const [msg, setMsg] = useState("");

  const isRejected = currentStatus === "Rejected";

  function handleApprove() {
    startTransition(async () => {
      await quickApproveBooking({ bookingId, approve: true });
      setMsg("Booking approved & confirmed ✓");
      router.refresh();
    });
  }

  function handleReopen() {
    startTransition(async () => {
      await reopenBooking(bookingId);
      setMsg("Booking reopened to Pending Verification ✓");
      router.refresh();
    });
  }

  function handleConfirmReject() {
    startTransition(async () => {
      await rejectBooking({
        bookingId,
        reason,
        notes: customNotes.trim() || undefined,
      });
      setShowRejectModal(false);
      setMsg("Booking rejected with reason recorded ❌");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <span>✨ {msg}</span>
          <button onClick={() => setMsg("")} className="text-emerald-700 hover:underline text-xs">✕</button>
        </div>
      )}

      {isRejected && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50/80 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-red-800">❌ Booking Rejected</p>
              <p className="mt-0.5 text-sm font-semibold text-red-950">
                Reason: {notes || "No reason specified."}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={handleReopen}
              className="btn-secondary text-xs bg-white text-ink-900 border-red-300 hover:bg-red-50 shadow-xs"
            >
              ↩️ Reopen / Restore Booking
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {!isRejected && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowRejectModal(true)}
            className="btn-secondary px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border-red-200"
          >
            Reject Booking ❌
          </button>
        )}

        {currentStatus !== "Confirmed" && !isRejected && (
          <button
            type="button"
            disabled={pending}
            onClick={handleApprove}
            className="btn-primary px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pending ? "Saving..." : "Approve & Confirm Booking ✓"}
          </button>
        )}
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-ink-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <h3 className="font-display font-bold text-base text-ink-900 flex items-center gap-2">
                <span>❌</span> Reject Booking #{bookingId}
              </h3>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="text-ink-400 hover:text-ink-900 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">Preset Rejection Reason *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-xs font-medium text-ink-900 focus:border-brand-500 focus:outline-hidden"
                >
                  {PRESET_REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">Staff Notes / Instructions</label>
                <textarea
                  rows={3}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Explain why this booking is rejected or what the customer must re-submit..."
                  className="w-full rounded-xl border border-ink-300 bg-white p-2.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleConfirmReject}
                className="btn-primary px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                {pending ? "Saving..." : "Confirm Rejection ❌"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
