"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  quickApproveBooking,
  verifyCustomerDocument,
  approveAfterHours,
  revertBookingDecision,
  revertDocumentDecision,
} from "@/lib/actions";
import { formatINR, formatDateTime } from "@/lib/utils";
import { BookingReviewModal, type BookingReviewData } from "./BookingReviewModal";

type PendingBooking = {
  id: number;
  booking_no: string;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  vehicle_id?: number | null;
  vehicle_name?: string | null;
  registration_no?: string | null;
  pickup_at: string;
  return_at: string;
  total_amount: number;
  paid_amount?: number;
  base_amount?: number;
  gst_amount?: number;
  deposit_amount?: number;
  status: string;
  after_hours: number;
  created_at: string;
  documents?: any[];
};

type PendingDoc = {
  id: number;
  booking_id: number | null;
  booking_no: string | null;
  customer_name: string | null;
  kind: string;
  number: string | null;
  file_path: string;
  created_at: string;
};

type PendingRefund = {
  id: number;
  refund_no: string;
  booking_no: string | null;
  customer_name: string | null;
  requested_amount: number;
  reason: string | null;
  status: string;
  requested_at: string;
};

type FallbackState = {
  type: "booking" | "document" | "after_hours";
  id: number;
  label: string;
  expiresAt: number;
};

export function PendingApprovalsInbox({
  pendingBookings = [],
  pendingDocs = [],
  pendingAfterHours = [],
  pendingRefunds = [],
  isAdmin = false,
}: {
  pendingBookings?: PendingBooking[];
  pendingDocs?: PendingDoc[];
  pendingAfterHours?: PendingBooking[];
  pendingRefunds?: PendingRefund[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"bookings" | "documents" | "after_hours" | "refunds">("bookings");
  const [actionSuccess, setActionSuccess] = useState("");
  const [fallback, setFallback] = useState<FallbackState | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState(0);
  const [reviewBooking, setReviewBooking] = useState<BookingReviewData | null>(null);

  const totalCount =
    pendingBookings.length +
    pendingDocs.length +
    pendingAfterHours.length +
    (isAdmin ? pendingRefunds.length : 0);

  const [prevCount, setPrevCount] = useState(totalCount);
  const [instantAlert, setInstantAlert] = useState("");

  // Live Background Auto-Polling (Every 4 seconds) for Instant Web Sync
  useEffect(() => {
    const pollInterval = setInterval(() => {
      router.refresh();
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [router]);

  // Detect New Web Booking & Play Chime Sound
  useEffect(() => {
    if (totalCount > prevCount) {
      setInstantAlert("✨ Instant Sync Alert: New Web Booking Request Received!");
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
      } catch {}
    }
    setPrevCount(totalCount);
  }, [totalCount, prevCount]);

  // Live 60-Second Countdown Timer
  useEffect(() => {
    if (!fallback) {
      setTimeLeftSec(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((fallback.expiresAt - Date.now()) / 1000));
      setTimeLeftSec(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setFallback(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fallback]);

  function startFallback(type: FallbackState["type"], id: number, label: string) {
    const expiresAt = Date.now() + 60_000; // 60 seconds / 1 minute fallback window
    setFallback({ type, id, label, expiresAt });
    setTimeLeftSec(60);
  }

  function handleBookingAction(bookingId: number, approve: boolean) {
    setActionSuccess("");
    startTransition(async () => {
      await quickApproveBooking({ bookingId, approve });
      const msg = `Booking ${approve ? "Approved & Confirmed ✓" : "Rejected & Cancelled ❌"}`;
      setActionSuccess(msg);
      startFallback("booking", bookingId, msg);
      router.refresh();
    });
  }

  function handleDocAction(documentId: number, approve: boolean) {
    setActionSuccess("");
    startTransition(async () => {
      await verifyCustomerDocument({ documentId, approve });
      const msg = `Document ${approve ? "Approved ✓" : "Rejected ❌"}`;
      setActionSuccess(msg);
      startFallback("document", documentId, msg);
      router.refresh();
    });
  }

  function handleAfterHoursAction(bookingId: number, approve: boolean) {
    setActionSuccess("");
    startTransition(async () => {
      await approveAfterHours(bookingId, approve);
      const msg = `After-hours request ${approve ? "Approved ✓" : "Declined ❌"}`;
      setActionSuccess(msg);
      startFallback("after_hours", bookingId, msg);
      router.refresh();
    });
  }

  function handleRevert() {
    if (!fallback) return;
    setActionSuccess("");
    startTransition(async () => {
      if (fallback.type === "booking" || fallback.type === "after_hours") {
        await revertBookingDecision(fallback.id);
      } else if (fallback.type === "document") {
        await revertDocumentDecision(fallback.id);
      }
      setActionSuccess("↩️ Decision undone! Request restored to pending state.");
      setFallback(null);
      router.refresh();
    });
  }

  if (totalCount === 0 && !fallback) {
    return (
      <div className="card p-5 border border-emerald-200 bg-emerald-50/40">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <h2 className="font-display font-semibold text-emerald-900">All Clear! No Pending Requests</h2>
            <p className="text-xs text-emerald-700">All customer bookings, documents, and approval requests are up to date.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4 shadow-sm border border-amber-200 bg-amber-50/20">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white font-bold text-sm">
            ⚠️
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Staff Action Required: Pending Approvals & Verifications
            </h2>
            <p className="text-xs text-ink-500">
              Review and process pending customer bookings, documents, and approval requests
            </p>
          </div>
        </div>

        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
          {totalCount} Pending Requests
        </span>
      </div>

      {/* Live 1-Minute Fallback Bar */}
      {fallback && timeLeftSec > 0 && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-100 p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-spin">⏱️</span>
            <div>
              <p className="font-bold text-xs text-amber-900">
                {fallback.label} • 1-Min Fallback Window Active: <span className="font-mono text-sm underline text-amber-950 font-black">{timeLeftSec}s</span>
              </p>
              <p className="text-[11px] text-amber-800">
                Decision can be undone or reverted within 1 minute before being permanently locked.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={handleRevert}
            className="btn-secondary px-3.5 py-2 text-xs font-bold bg-white text-red-700 hover:bg-red-50 border-red-300 shadow-sm"
          >
            ↩️ Undo / Revert Decision ({timeLeftSec}s)
          </button>
        </div>
      )}

      {instantAlert && (
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-100 p-3.5 flex items-center justify-between gap-3 text-xs font-bold text-emerald-950 shadow-md animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <span>{instantAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setInstantAlert("")}
            className="text-xs text-emerald-800 hover:text-emerald-950 underline font-semibold"
          >
            Dismiss ✕
          </button>
        </div>
      )}

      {actionSuccess && !fallback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
          {actionSuccess}
        </div>
      )}

      {/* Tabs Bar */}
      <nav className="flex gap-2 border-b border-ink-100 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("bookings")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === "bookings"
              ? "bg-brand-600 text-white"
              : "bg-white text-ink-600 hover:bg-ink-100"
          }`}
        >
          📋 Bookings Verification ({pendingBookings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === "documents"
              ? "bg-brand-600 text-white"
              : "bg-white text-ink-600 hover:bg-ink-100"
          }`}
        >
          🪪 Documents Approval ({pendingDocs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("after_hours")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            activeTab === "after_hours"
              ? "bg-brand-600 text-white"
              : "bg-white text-ink-600 hover:bg-ink-100"
          }`}
        >
          🌙 After-Hours Requests ({pendingAfterHours.length})
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("refunds")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "refunds"
                ? "bg-brand-600 text-white"
                : "bg-white text-ink-600 hover:bg-ink-100"
            }`}
          >
            💰 Refund Requests ({pendingRefunds.length})
          </button>
        )}
      </nav>

      {/* Tab Content 1: Pending Bookings */}
      {activeTab === "bookings" && (
        <div className="space-y-3">
          {pendingBookings.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">No bookings pending verification.</p>
          ) : (
            pendingBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/bookings/${b.id}`}
                      className="font-bold text-sm text-ink-900 hover:text-brand-700 hover:underline"
                    >
                      {b.booking_no}
                    </Link>
                    <span className="badge bg-amber-100 text-amber-800">{b.status}</span>
                  </div>
                  <p className="text-xs text-ink-700">
                    Customer: <strong>{b.customer_name ?? "—"}</strong> ({b.customer_phone ?? "—"}) • Vehicle: <strong>{b.vehicle_name ?? "—"}</strong>
                  </p>
                  <p className="text-[11px] text-ink-500">
                    Pickup: {formatDateTime(b.pickup_at)} • Return: {formatDateTime(b.return_at)} • Total: <strong>{formatINR(b.total_amount)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewBooking(b as any)}
                    className="btn-secondary px-3 py-1.5 text-xs font-semibold bg-brand-50 text-brand-900 border-brand-200 hover:bg-brand-100"
                  >
                    Review Details 🔍
                  </button>
                  <Link
                    href={`/dashboard/bookings/${b.id}`}
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    Full ↗
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleBookingAction(b.id, false)}
                    className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Reject ❌
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleBookingAction(b.id, true)}
                    className="btn-primary px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    Approve ✓
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content 2: Unverified Documents */}
      {activeTab === "documents" && (
        <div className="space-y-3">
          {pendingDocs.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">No documents pending manual verification.</p>
          ) : (
            pendingDocs.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  {d.file_path ? (
                    <img
                      src={d.file_path}
                      alt={d.kind}
                      className="h-12 w-16 rounded-lg object-cover border border-ink-200 shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-16 rounded-lg bg-ink-100 flex items-center justify-center text-xs text-ink-400">
                      🪪
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-sm text-ink-900 capitalize">
                      {d.kind.replace("_", " ")} {d.number ? `(${d.number})` : ""}
                    </p>
                    <p className="text-xs text-ink-600">
                      Customer: <strong>{d.customer_name ?? "—"}</strong> {d.booking_no ? `• Booking: ${d.booking_no}` : ""}
                    </p>
                    <p className="text-[11px] text-ink-400">Uploaded: {d.created_at}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {d.booking_id && (
                    <Link
                      href={`/dashboard/bookings/${d.booking_id}`}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Inspect Photo
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDocAction(d.id, false)}
                    className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Reject ❌
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDocAction(d.id, true)}
                    className="btn-primary px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    Approve Document ✓
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content 3: After-Hours Requests */}
      {activeTab === "after_hours" && (
        <div className="space-y-3">
          {pendingAfterHours.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">No after-hours pickup requests awaiting approval.</p>
          ) : (
            pendingAfterHours.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-ink-900">{b.booking_no}</p>
                    <span className="badge bg-purple-100 text-purple-800">🌙 After-Hours Request</span>
                  </div>
                  <p className="text-xs text-ink-700">
                    Customer: <strong>{b.customer_name ?? "—"}</strong> • Vehicle: <strong>{b.vehicle_name ?? "—"}</strong>
                  </p>
                  <p className="text-[11px] text-ink-500">
                    Pickup Time: <strong>{formatDateTime(b.pickup_at)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAfterHoursAction(b.id, false)}
                    className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Decline ❌
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAfterHoursAction(b.id, true)}
                    className="btn-primary px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700"
                  >
                    Approve After-Hours ✓
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content 4: Refund Requests */}
      {activeTab === "refunds" && isAdmin && (
        <div className="space-y-3">
          {pendingRefunds.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">No refunds awaiting review.</p>
          ) : (
            pendingRefunds.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-ink-900">{r.refund_no}</p>
                    <span className="badge bg-amber-100 text-amber-800">{r.status}</span>
                  </div>
                  <p className="text-xs text-ink-700">
                    Customer: <strong>{r.customer_name ?? "—"}</strong> {r.booking_no ? `• Booking: ${r.booking_no}` : ""}
                  </p>
                  <p className="text-[11px] text-ink-500">
                    Requested Amount: <strong>{formatINR(r.requested_amount)}</strong> • Reason: {r.reason ?? "N/A"}
                  </p>
                </div>

                <Link href="/dashboard/refunds" className="btn-primary px-3 py-1.5 text-xs">
                  Review & Approve Refund →
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {/* Slide-Over Inspection & Review Drawer for Dashboard */}
      <BookingReviewModal
        booking={reviewBooking}
        isOpen={Boolean(reviewBooking)}
        onClose={() => setReviewBooking(null)}
      />
    </div>
  );
}
