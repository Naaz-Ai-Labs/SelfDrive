"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatINR, formatDateTime, formatDate, waLink } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { quickApproveBooking, rejectBooking, reopenBooking, verifyCustomerDocument } from "@/lib/actions";
import { PaymentDetailModal, type PaymentTransactionData } from "./PaymentDetailModal";

export type CustomerDocument = {
  id: number;
  kind: string;
  number: string | null;
  expiry_date: string | null;
  file_path: string;
  verified: number;
  created_at?: string;
};

export type BookingReviewData = {
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
  actual_pickup_at?: string | null;
  actual_return_at?: string | null;
  status: string;
  base_amount?: number;
  surcharge_amount?: number;
  gst_amount?: number;
  deposit_amount?: number;
  total_amount: number;
  paid_amount: number;
  notes?: string | null;
  created_at?: string;
  documents?: CustomerDocument[];
  payments?: PaymentTransactionData[];
};

const DOC_KIND_INFO: Record<string, { label: string; icon: string }> = {
  licence: { label: "Driving Licence", icon: "🪪" },
  govt_id: { label: "Aadhaar / Govt ID", icon: "🆔" },
  address_proof: { label: "Address Proof", icon: "🏠" },
  photo: { label: "Customer Photo", icon: "👤" },
  other: { label: "Other Document", icon: "📄" },
};

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

export function BookingReviewModal({
  booking,
  isOpen,
  onClose,
}: {
  booking: BookingReviewData | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedDoc, setSelectedDoc] = useState<CustomerDocument | null>(null);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<PaymentTransactionData | null>(null);
  const [zoom, setZoom] = useState(1);

  // Rejection Dialog State
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState(PRESET_REJECTION_REASONS[0]);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  if (!isOpen || !booking) return null;

  const docs = booking.documents ?? [];
  const verifiedDocsCount = docs.filter((d) => d.verified === 1).length;
  const balanceDue = Math.max(0, (booking.total_amount || 0) + (booking.deposit_amount || 0) - (booking.paid_amount || 0));

  function handleDocumentVerify(documentId: number, approve: boolean) {
    startTransition(async () => {
      await verifyCustomerDocument({ documentId, approve });
      if (selectedDoc?.id === documentId) {
        setSelectedDoc((prev) => (prev ? { ...prev, verified: approve ? 1 : 0 } : null));
      }
      setActionSuccess(`Document ${approve ? "Verified ✓" : "Marked Unverified ❌"}`);
      router.refresh();
    });
  }

  function handleApproveBooking() {
    startTransition(async () => {
      await quickApproveBooking({ bookingId: booking!.id, approve: true });
      setActionSuccess("Booking Approved & Confirmed ✓");
      router.refresh();
      setTimeout(() => onClose(), 1200);
    });
  }

  function handleReopenBooking() {
    startTransition(async () => {
      await reopenBooking(booking!.id);
      setActionSuccess("Booking Reopened to Pending Verification ✓");
      router.refresh();
    });
  }

  function handleConfirmRejection() {
    if (!rejectReason) return;
    startTransition(async () => {
      await rejectBooking({
        bookingId: booking!.id,
        reason: rejectReason,
        notes: rejectNotes.trim() || undefined,
      });
      setShowRejectDialog(false);
      setActionSuccess("Booking Rejected with Reason Recorded ❌");
      router.refresh();
      setTimeout(() => onClose(), 1500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      {/* Slide-over Drawer Container */}
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl overflow-hidden border-l border-ink-200 animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-ink-950 font-black text-sm">
              📋
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold">{booking.booking_no}</h2>
                <StatusBadge status={booking.status} />
              </div>
              <p className="text-xs text-ink-300">
                Customer & Booking Verification Review
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <span>✨ {actionSuccess}</span>
            <button onClick={() => setActionSuccess("")} className="text-emerald-700 hover:underline">✕</button>
          </div>
        )}

        {booking.status === "Rejected" && (
          <div className="bg-red-50 border-b border-red-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-800">❌ Booking Rejected</p>
                <p className="mt-0.5 text-sm font-semibold text-red-950">
                  {booking.notes ?? "No rejection notes specified."}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={handleReopenBooking}
                className="btn-secondary text-xs bg-white text-ink-900 border-red-300 hover:bg-red-50"
              >
                ↩️ Reopen / Restore
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Quick Staff Action Bar */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink-700">Staff Decision:</span>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="btn-secondary px-3 py-1.5 text-xs font-medium"
              >
                Open Full Page ↗
              </Link>
              {booking.status !== "Rejected" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowRejectDialog(true)}
                  className="btn-secondary px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border-red-200"
                >
                  Reject ❌
                </button>
              )}
              {booking.status !== "Confirmed" && booking.status !== "Rejected" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleApproveBooking}
                  className="btn-primary px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 shadow-xs"
                >
                  Approve & Confirm ✓
                </button>
              )}
            </div>
          </div>

          {/* Rejection Dialog Form */}
          {showRejectDialog && (
            <div className="rounded-xl border-2 border-red-300 bg-red-50/70 p-4 space-y-3 shadow-md animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-red-900 flex items-center gap-1.5">
                  <span>❌</span> Select Reason for Rejecting Booking
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="text-xs font-semibold text-red-700 hover:underline"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-red-900 mb-1">Preset Reason *</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-ink-900 focus:border-red-500 focus:outline-hidden"
                >
                  {PRESET_REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-red-900 mb-1">Additional Staff Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="e.g. Licence expired on 2024-05-10, requested updated DL copy from customer."
                  className="w-full rounded-lg border border-red-300 bg-white p-2 text-xs text-ink-900 focus:border-red-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleConfirmRejection}
                  className="btn-primary px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  {pending ? "Saving..." : "Confirm Rejection ❌"}
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Customer Contact & Details */}
          <div className="card p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-ink-900 border-b border-ink-100 pb-2">
              Customer Information
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-ink-400">Customer Name</span>
                <p className="font-bold text-sm text-ink-900">{booking.customer_name ?? "—"}</p>
              </div>

              <div>
                <span className="text-ink-400">Phone Number</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="font-semibold text-ink-800">{booking.customer_phone ?? "—"}</p>
                  {booking.customer_phone && (
                    <a
                      href={waLink(booking.customer_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-200"
                    >
                      WhatsApp 💬
                    </a>
                  )}
                </div>
              </div>

              <div className="col-span-2">
                <span className="text-ink-400">Email Address</span>
                <p className="font-medium text-ink-700">{booking.customer_email ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Section 2: Vehicle & Schedule */}
          <div className="card p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-ink-900 border-b border-ink-100 pb-2">
              Vehicle & Schedule
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2 flex items-center justify-between rounded-lg bg-ink-50 p-2.5">
                <div>
                  <p className="font-bold text-ink-900 text-sm">{booking.vehicle_name ?? "—"}</p>
                  <p className="font-mono text-xs text-ink-500 font-semibold">{booking.registration_no ?? "—"}</p>
                </div>
                <span className="badge bg-brand-100 text-brand-900 font-bold text-[11px]">
                  Vehicle ID: #{booking.vehicle_id ?? "—"}
                </span>
              </div>

              <div>
                <span className="text-ink-400">Pickup Date & Time</span>
                <p className="font-bold text-ink-800 mt-0.5">{formatDateTime(booking.pickup_at)}</p>
              </div>

              <div>
                <span className="text-ink-400">Scheduled Return</span>
                <p className="font-bold text-ink-800 mt-0.5">{formatDateTime(booking.return_at)}</p>
              </div>
            </div>
          </div>

          {/* Section 3: Financial Summary & Payments */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-ink-100 pb-2">
              <h3 className="font-display font-semibold text-sm text-ink-900">
                Payment & Pricing Summary
              </h3>
              <span className={`badge text-xs font-bold ${balanceDue === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {balanceDue === 0 ? "Fully Paid ✓" : `Balance: ${formatINR(balanceDue)}`}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-ink-600">
                <span>Base Rental Fare:</span>
                <span className="font-medium text-ink-900">{formatINR(booking.base_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>GST (Tax):</span>
                <span className="font-medium text-ink-900">{formatINR(booking.gst_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Refundable Security Deposit:</span>
                <span className="font-medium text-ink-900">{formatINR(booking.deposit_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-2 font-bold text-sm text-ink-900">
                <span>Total Amount Due:</span>
                <span>{formatINR((booking.total_amount || 0) + (booking.deposit_amount || 0))}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Amount Paid:</span>
                <span>{formatINR(booking.paid_amount || 0)}</span>
              </div>
            </div>

            {/* Attached Payment Transactions List */}
            {booking.payments && booking.payments.length > 0 && (
              <div className="border-t border-ink-100 pt-3 space-y-2">
                <p className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                  Payment Transactions ({booking.payments.length})
                </p>
                <div className="space-y-1.5">
                  {booking.payments.map((p) => (
                    <div
                      key={p.id}
                      onClick={() =>
                        setSelectedPaymentDetail({
                          ...p,
                          booking_no: booking.booking_no,
                          customer_name: booking.customer_name,
                          customer_phone: booking.customer_phone,
                          customer_email: booking.customer_email,
                          vehicle_name: booking.vehicle_name,
                          registration_no: booking.registration_no,
                          pickup_at: booking.pickup_at,
                          return_at: booking.return_at,
                        })
                      }
                      className="group flex cursor-pointer items-center justify-between rounded-lg border border-ink-200 bg-white p-2 text-xs transition hover:border-brand-400 hover:bg-brand-50/20"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink-900 group-hover:text-brand-700">
                            {formatINR(p.amount)}
                          </span>
                          <span className="rounded bg-ink-100 px-1 py-0.2 text-[10px] font-semibold text-ink-700 capitalize">
                            {p.kind}
                          </span>
                          {p.method && (
                            <span className="text-[11px] text-ink-400">· {p.method}</span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-ink-400 mt-0.5">
                          {p.payment_no}
                          {p.razorpay_payment_id ? ` · Ref: ${p.razorpay_payment_id}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800 border border-brand-200 group-hover:bg-brand-100">
                          Inspect 🔍
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Customer ID Proofs & Verification */}
          <div className="card p-4 space-y-3 border-2 border-brand-200 bg-brand-50/10">
            <div className="flex items-center justify-between border-b border-ink-100 pb-2">
              <div>
                <h3 className="font-display font-semibold text-sm text-ink-900 flex items-center gap-1.5">
                  <span>🪪</span> Customer ID Proofs & Documents
                </h3>
                <p className="text-[11px] text-ink-500">
                  Inspect photo clarity, validity & verify matching name
                </p>
              </div>

              <span className={`badge text-[11px] font-bold ${verifiedDocsCount === docs.length && docs.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {docs.length === 0 ? "No Docs" : `${verifiedDocsCount}/${docs.length} Verified`}
              </span>
            </div>

            {docs.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-400 bg-white rounded-lg border border-ink-100">
                No identification documents uploaded for this booking.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {docs.map((doc) => {
                  const info = DOC_KIND_INFO[doc.kind] ?? DOC_KIND_INFO.other;
                  const isVerified = doc.verified === 1;

                  return (
                    <div
                      key={doc.id}
                      className={`overflow-hidden rounded-xl border bg-white p-3 space-y-2.5 transition shadow-xs ${
                        isVerified ? "border-emerald-300" : "border-amber-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-ink-900 flex items-center gap-1">
                          <span>{info.icon}</span> {info.label}
                        </span>
                        <span className={`badge text-[10px] font-bold ${isVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {isVerified ? "Verified ✓" : "Pending"}
                        </span>
                      </div>

                      {doc.number && (
                        <p className="font-mono text-xs font-semibold text-ink-800 truncate">
                          No: {doc.number}
                        </p>
                      )}

                      {/* Clickable Image Thumbnail */}
                      <div
                        onClick={() => {
                          setSelectedDoc(doc);
                          setZoom(1);
                        }}
                        className="group relative cursor-pointer overflow-hidden rounded-lg border border-ink-200 bg-ink-900 aspect-video flex items-center justify-center"
                      >
                        <img
                          src={doc.file_path}
                          alt={info.label}
                          className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                          <span className="rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-bold text-ink-900 shadow">
                            🔍 Inspect & Zoom
                          </span>
                        </div>
                      </div>

                      {/* Document Verify Action Buttons */}
                      <div className="flex gap-2 pt-1 border-t border-ink-100">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setZoom(1);
                          }}
                          className="btn-secondary flex-1 justify-center py-1 text-[11px]"
                        >
                          Inspect
                        </button>
                        {isVerified ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleDocumentVerify(doc.id, false)}
                            className="btn-secondary py-1 px-2 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            Unverify
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleDocumentVerify(doc.id, true)}
                            className="btn-primary py-1 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                          >
                            Approve ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-ink-100 bg-ink-50 px-6 py-3 flex items-center justify-between">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            Open Complete Booking Page →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-1.5"
          >
            Close
          </button>
        </div>
      </div>

      {/* Full-Screen Document Lightbox Modal with Zoom */}
      {selectedDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink-100 bg-ink-950 px-6 py-3.5 text-white">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {DOC_KIND_INFO[selectedDoc.kind]?.icon ?? "📄"}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-sm">
                    {DOC_KIND_INFO[selectedDoc.kind]?.label ?? "Document Viewer"}
                  </h3>
                  {selectedDoc.number && (
                    <p className="font-mono text-xs text-ink-300">
                      ID: {selectedDoc.number}
                    </p>
                  )}
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 text-white"
                >
                  Zoom -
                </button>
                <span className="font-mono text-xs text-ink-300">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 text-white"
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 text-white"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="ml-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Modal Image Viewport */}
            <div className="relative flex-1 overflow-auto bg-ink-950 p-6 flex items-center justify-center min-h-[360px]">
              <img
                src={selectedDoc.file_path}
                alt="Document Preview"
                style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>

            {/* Modal Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-ink-50 px-6 py-3.5">
              <span className={`badge ${selectedDoc.verified === 1 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                Status: {selectedDoc.verified === 1 ? "Verified ✓" : "Pending Verification"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleDocumentVerify(selectedDoc.id, false)}
                  className="btn-secondary text-xs text-red-600 hover:bg-red-50 border-red-200"
                >
                  Reject Document
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleDocumentVerify(selectedDoc.id, true)}
                  className="btn-primary text-xs bg-emerald-600 hover:bg-emerald-700"
                >
                  {pending ? "Saving..." : "Approve & Mark Verified ✓"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Inspection Modal for Payments */}
      <PaymentDetailModal
        payment={selectedPaymentDetail}
        isOpen={Boolean(selectedPaymentDetail)}
        onClose={() => setSelectedPaymentDetail(null)}
      />
    </div>
  );
}
