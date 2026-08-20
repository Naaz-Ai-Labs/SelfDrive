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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Booking Reference</span>
              <span className="rounded bg-brand-100 px-2 py-0.5 font-mono text-xs font-bold text-brand-950">
                {tracking.booking_no}
              </span>
              <span suppressHydrationWarning className="inline-flex items-center rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                🕒 Created: {formatDateTime(tracking.created_at)}
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold text-ink-950 mt-1">
              {tracking.vehicle_name ?? "Vehicle Rental"}
            </h2>
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
                {isRejected ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : isConfirmed ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  "3"
                )}
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-200 text-red-800">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
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
                className="btn-primary inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white text-xs px-4 py-2"
              >
                <span>Contact Support on WhatsApp</span>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </a>
              <Link href={`/invoice/${tracking.booking_no}`} className="btn-secondary inline-flex items-center gap-1.5 text-xs px-4 py-2 bg-white">
                <svg className="h-3.5 w-3.5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>View Payment Receipt</span>
              </Link>
            </div>
          </div>
        ) : isConfirmed ? (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/90 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-emerald-800">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-base text-emerald-950">
                  Your Booking is Confirmed!
                </h3>
                <p className="text-xs text-emerald-800">
                  Your identity documents have been verified and your vehicle is reserved. Please visit our branch at your scheduled pickup time.
                </p>
                <div className="mt-2 rounded-lg bg-white/80 p-3 text-xs text-ink-800 space-y-1 border border-emerald-200">
                  <p className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span><strong>Pickup Location:</strong> {tracking.pickup_branch}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Pickup Time:</strong> {formatDateTime(tracking.pickup_at)}</span>
                  </p>
                  <p className="text-[11px] text-ink-500 flex items-center gap-1 mt-1">
                    <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Please carry your original physical Driving Licence and Aadhaar card for vehicle key handover.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/invoice/${tracking.booking_no}`}
                className="btn-primary inline-flex items-center gap-1.5 text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download / Print Tax Invoice</span>
              </Link>
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary inline-flex items-center gap-1.5 text-xs px-4 py-2 bg-white"
              >
                <span>Need Help? Chat on WhatsApp</span>
                <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-5 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-amber-950">
                  Verification In Progress
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your online payment of {formatINR(tracking.paid_amount)} has been confirmed! Our staff is currently verifying your uploaded Driving Licence & ID proofs.
                </p>
                <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Typical verification time: <strong>15–30 minutes</strong> during business hours (8:00 AM – 9:00 PM).</span>
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
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
              >
                <span>Tax Invoice</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
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
                <span>{formatINR(tracking.total_amount)}</span>
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
                {/* Verification status is NOT shown here. Documents are checked in
                    person when the customer collects the vehicle, so a "Reviewing"
                    badge on the website only invites questions about a process that
                    does not happen online. Staff still see the real status in the CRM.
                    The raw licence/ID number is likewise never sent to this public,
                    unauthenticated page. */}
                {tracking.documents.map((d) => (
                  <div
                    key={d.kind}
                    className="flex items-center justify-between rounded-lg bg-ink-50 p-2.5 text-xs"
                  >
                    <p className="font-semibold text-ink-900 capitalize">
                      {d.kind.replace("_", " ")}
                    </p>
                    <span className="badge bg-ink-100 text-ink-700 text-[10px] font-bold">Received</span>
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
