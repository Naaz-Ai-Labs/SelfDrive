"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDateTime, formatINR } from "@/lib/utils";
import type { TrackingData } from "@/lib/tracking-actions";

export function BookingStatusFlow({
  tracking,
}: {
  tracking: TrackingData;
}) {
  const isRejected = tracking.status === "Rejected" || tracking.status === "Cancelled";
  const isConfirmed = ["Confirmed", "Ready for pickup", "Vehicle handed over", "Active rental", "Completed"].includes(tracking.status);
  const isTripActive = ["Vehicle handed over", "Active rental"].includes(tracking.status);
  const isCompleted = tracking.status === "Completed";
  const isUnderReview = ["Pending verification", "Payment received", "Pending", "Draft"].includes(tracking.status);

  // Stepper status flags
  const step1Complete = true; // Payment is made
  const step2Complete = tracking.is_all_docs_verified || isConfirmed;
  const step2InProgress = !step2Complete && !isRejected;

  const waSupportUrl = `https://wa.me/919845210001?text=${encodeURIComponent(
    `Hello Darshh Holiday Support, I am inquiring about my booking ${tracking.booking_no}. Status: ${tracking.status}.`
  )}`;

  return (
    <div className="space-y-6">
      
      {/* Top Header Card with Real-time Status Badge */}
      <div className="card p-6 border-ink-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Booking Reference</span>
              <span className="rounded bg-brand-100 px-2 py-0.5 font-mono text-xs font-bold text-brand-950">
                {tracking.booking_no}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold text-ink-950 mt-1">
              {tracking.vehicle_name ?? "Vehicle Rental"}
            </h1>
          </div>

          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold shadow-xs ${
                isRejected
                  ? "bg-red-100 text-red-800 ring-1 ring-red-300"
                  : isConfirmed
                  ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                  : "bg-amber-100 text-amber-800 ring-1 ring-amber-300 animate-pulse"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {isRejected ? "Booking Rejected" : isConfirmed ? (isTripActive ? "Trip In Progress" : "Booking Confirmed ✓") : "Verification Under Review"}
            </span>
            <p className="text-[11px] text-ink-400 mt-1">
              Created {formatDateTime(tracking.created_at)}
            </p>
          </div>
        </div>

        {/* Visual Progress Stepper Flow */}
        <div className="py-8">
          <div className="relative flex flex-col md:flex-row justify-between gap-6 md:gap-0">
            
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-5 left-8 right-8 h-1 bg-ink-200 -z-0" />
            <div
              className={`hidden md:block absolute top-5 left-8 h-1 transition-all duration-500 -z-0 ${
                isRejected
                  ? "bg-red-500 w-full"
                  : isCompleted
                  ? "bg-emerald-500 w-full"
                  : isConfirmed
                  ? "bg-emerald-500 w-[75%]"
                  : "bg-amber-500 w-[45%]"
              }`}
            />

            {/* Step 1: Payment Verified */}
            <div className="relative z-10 flex md:flex-col items-center gap-3 md:text-center md:w-1/3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold shadow-md ring-4 ring-white">
                ✓
              </div>
              <div>
                <p className="font-bold text-sm text-ink-900">1. Payment Verified</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {formatINR(tracking.paid_amount)} paid online
                </p>
              </div>
            </div>

            {/* Step 2: Document Verification */}
            <div className="relative z-10 flex md:flex-col items-center gap-3 md:text-center md:w-1/3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold shadow-md ring-4 ring-white transition ${
                  step2Complete
                    ? "bg-emerald-600 text-white"
                    : isRejected
                    ? "bg-red-500 text-white"
                    : "bg-amber-500 text-white ring-amber-100 animate-pulse"
                }`}
              >
                {step2Complete ? "✓" : isRejected ? "✕" : "2"}
              </div>
              <div>
                <p className="font-bold text-sm text-ink-900">2. Document Inspection</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {step2Complete
                    ? "ID & Licence Verified ✓"
                    : isRejected
                    ? "Review Completed"
                    : "Staff Reviewing Documents ⏳"}
                </p>
              </div>
            </div>

            {/* Step 3: Final Decision & Handover */}
            <div className="relative z-10 flex md:flex-col items-center gap-3 md:text-center md:w-1/3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold shadow-md ring-4 ring-white transition ${
                  isRejected
                    ? "bg-red-600 text-white"
                    : isConfirmed
                    ? "bg-emerald-600 text-white"
                    : "bg-ink-200 text-ink-600"
                }`}
              >
                {isRejected ? "❌" : isConfirmed ? "✓" : "3"}
              </div>
              <div>
                <p className="font-bold text-sm text-ink-900">
                  {isRejected ? "3. Booking Rejected" : "3. Confirmation & Pickup"}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {isRejected
                    ? "Reason recorded below"
                    : isConfirmed
                    ? "Ready at Branch"
                    : "Awaiting Staff Approval"}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Dynamic Status Alert Banners */}
        {isRejected ? (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50/90 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">❌</span>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-base text-red-950">
                  Booking Not Approved
                </h3>
                <p className="text-sm font-semibold text-red-900">
                  Reason: {tracking.notes ?? "Document verification requirement not met."}
                </p>
                <p className="text-xs text-red-800">
                  Our operations team could not approve this booking due to the reason specified above. If you have updated document copies or require a refund, please contact our support desk immediately.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary bg-red-700 hover:bg-red-800 text-white text-xs px-4 py-2"
              >
                Contact Support on WhatsApp 💬
              </a>
              <Link href={`/invoice/${tracking.booking_no}`} className="btn-secondary text-xs px-4 py-2 bg-white">
                View Payment Receipt 🧾
              </Link>
            </div>
          </div>
        ) : isConfirmed ? (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/90 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎉</span>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-base text-emerald-950">
                  Your Booking is Confirmed!
                </h3>
                <p className="text-xs text-emerald-800">
                  Your identity documents have been verified and your vehicle is reserved. Please visit our branch at your scheduled pickup time.
                </p>
                <div className="mt-2 rounded-lg bg-white/80 p-3 text-xs text-ink-800 space-y-1 border border-emerald-200">
                  <p><strong>📍 Pickup Location:</strong> {tracking.pickup_branch}</p>
                  <p><strong>⏰ Pickup Time:</strong> {formatDateTime(tracking.pickup_at)}</p>
                  <p className="text-[11px] text-ink-500">
                    💡 Please carry your original physical Driving Licence and Aadhaar card for vehicle key handover.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/invoice/${tracking.booking_no}`}
                className="btn-primary text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                Download / Print Tax Invoice 🧾
              </Link>
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-xs px-4 py-2 bg-white"
              >
                Need Help? Chat on WhatsApp 💬
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-5 space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h3 className="font-display font-bold text-base text-amber-950">
                  Verification In Progress
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your online payment of {formatINR(tracking.paid_amount)} has been confirmed! Our staff is currently verifying your uploaded Driving Licence & ID proofs.
                </p>
                <p className="text-[11px] text-amber-700 mt-1">
                  ⏱ Typical verification time: <strong>15–30 minutes</strong> during business hours (8:00 AM – 9:00 PM).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grid: Vehicle Details & Financial Breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* Vehicle & Rental Schedule */}
        <div className="card p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-ink-900 border-b border-ink-100 pb-2">
            Vehicle & Schedule
          </h2>

          {tracking.photo_url && (
            <div className="relative h-44 w-full overflow-hidden rounded-xl bg-ink-900">
              <Image
                src={tracking.photo_url}
                alt={tracking.vehicle_name ?? "Vehicle"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 500px"
              />
            </div>
          )}

          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-ink-50 pb-1.5">
              <span className="text-ink-500">Vehicle Model</span>
              <span className="font-bold text-ink-900">{tracking.vehicle_name ?? "—"}</span>
            </div>
            {tracking.registration_no && (
              <div className="flex justify-between border-b border-ink-50 pb-1.5">
                <span className="text-ink-500">Registration Number</span>
                <span className="font-mono font-bold text-ink-800">{tracking.registration_no}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-ink-50 pb-1.5">
              <span className="text-ink-500">Pickup Date & Time</span>
              <span className="font-semibold text-ink-900">{formatDateTime(tracking.pickup_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Return Date & Time</span>
              <span className="font-semibold text-ink-900">{formatDateTime(tracking.return_at)}</span>
            </div>
          </div>
        </div>

        {/* Pricing & Document Status */}
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-2">
              <h2 className="font-display text-lg font-bold text-ink-900">
                Payment Summary
              </h2>
              <Link
                href={`/invoice/${tracking.booking_no}`}
                className="text-xs font-bold text-brand-700 hover:underline"
              >
                Tax Invoice 🧾 ↗
              </Link>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-ink-600">
                <span>Base Fare:</span>
                <span className="font-medium text-ink-900">{formatINR(tracking.base_amount)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>GST (Tax):</span>
                <span className="font-medium text-ink-900">{formatINR(tracking.gst_amount)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>Refundable Security Deposit:</span>
                <span className="font-medium text-ink-900">{formatINR(tracking.deposit_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-2 font-bold text-sm text-ink-900">
                <span>Total Amount:</span>
                <span>{formatINR(tracking.total_amount + tracking.deposit_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Amount Paid:</span>
                <span>{formatINR(tracking.paid_amount)}</span>
              </div>
            </div>
          </div>

          {/* Uploaded Documents List */}
          <div className="card p-6 space-y-3">
            <h2 className="font-display text-sm font-bold text-ink-900 border-b border-ink-100 pb-2">
              Identification Proofs ({tracking.documents.length})
            </h2>

            {tracking.documents.length === 0 ? (
              <p className="text-xs text-ink-400">No documents recorded.</p>
            ) : (
              <div className="space-y-2">
                {tracking.documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg bg-ink-50 p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink-900 capitalize">
                        {d.kind.replace("_", " ")}
                      </p>
                      {d.number && <p className="font-mono text-[11px] text-ink-500">{d.number}</p>}
                    </div>
                    <span
                      className={`badge text-[10px] font-bold ${
                        d.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {d.verified ? "Verified ✓" : "Reviewing"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
