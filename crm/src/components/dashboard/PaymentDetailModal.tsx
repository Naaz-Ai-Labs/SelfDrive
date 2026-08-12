"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatINR, formatDateTime, formatDate, waLink } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { markPaymentPaid } from "@/lib/actions";

export type PaymentTransactionData = {
  id: number;
  payment_no: string;
  booking_id?: number | null;
  booking_no?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  vehicle_name?: string | null;
  registration_no?: string | null;
  pickup_at?: string | null;
  return_at?: string | null;
  amount: number;
  amount_paise?: number;
  currency?: string;
  kind: string;
  method?: string | null;
  upi_id?: string | null;
  vpa?: string | null;
  bank_ref_no?: string | null;
  gateway_ref?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  status: string;
  notes?: string | null;
  receipt_no?: string | null;
  created_at?: string;
};

const KIND_INFO: Record<string, { label: string; bg: string }> = {
  advance: { label: "Advance Payment", bg: "bg-blue-100 text-blue-800" },
  full: { label: "Full Payment", bg: "bg-emerald-100 text-emerald-800" },
  deposit: { label: "Security Deposit", bg: "bg-purple-100 text-purple-800" },
  extra_charge: { label: "Extra Charges / Damage", bg: "bg-amber-100 text-amber-800" },
};

export function PaymentDetailModal({
  payment,
  isOpen,
  onClose,
}: {
  payment: PaymentTransactionData | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !payment) return null;

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function handleMarkPaid() {
    startTransition(async () => {
      await markPaymentPaid(payment!.id);
      router.refresh();
      setTimeout(() => onClose(), 800);
    });
  }

  const kindMeta = KIND_INFO[payment.kind] ?? { label: payment.kind, bg: "bg-ink-100 text-ink-800" };
  const isPaid = payment.status === "Paid";
  const upiAddress = payment.upi_id || payment.vpa;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      {/* Slide-over Drawer */}
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl overflow-hidden border-l border-ink-200 animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-ink-950 font-black text-lg">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h2m4 0h4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold">{payment.payment_no}</h2>
                <StatusBadge status={payment.status} />
              </div>
              <p className="text-xs text-ink-300">Transaction & Payment Record Details</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Amount Hero Card */}
          <div className="rounded-2xl border border-ink-200 bg-gradient-to-br from-ink-50 to-brand-50/20 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
                Transaction Amount
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${kindMeta.bg}`}>
                {kindMeta.label}
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-ink-950">
                {formatINR(payment.amount)}
              </span>
              <span className="text-xs font-medium text-ink-400">
                ({payment.currency ?? "INR"})
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-600 border-t border-ink-200/60 pt-3">
              <div>
                <span className="text-ink-400">Status: </span>
                <strong className={isPaid ? "text-emerald-700" : "text-amber-700"}>
                  {payment.status}
                </strong>
              </div>
              {payment.paid_at && (
                <div>
                  <span className="text-ink-400">Paid At: </span>
                  <strong className="text-ink-900">{formatDateTime(payment.paid_at)}</strong>
                </div>
              )}
              {payment.due_date && !isPaid && (
                <div>
                  <span className="text-ink-400">Due Date: </span>
                  <strong className="text-red-700">{formatDate(payment.due_date)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Gateway & Online Payment Info */}
          <div className="card p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-ink-900 border-b border-ink-100 pb-2 flex items-center justify-between">
              <span>Transaction & Gateway Details</span>
              <span className="font-mono text-xs text-brand-700 font-bold">
                {payment.method ?? "Online Gateway"}
              </span>
            </h3>

            <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-ink-400">Payment Mode / Method</dt>
                <dd className="font-semibold text-ink-900 mt-0.5">{payment.method ?? "Razorpay UPI"}</dd>
              </div>

              {payment.receipt_no && (
                <div>
                  <dt className="text-ink-400">Receipt / Invoice Ref</dt>
                  <dd className="font-mono font-semibold text-ink-900 mt-0.5">{payment.receipt_no}</dd>
                </div>
              )}

              {/* UPI ID / VPA Card */}
              {upiAddress && (
                <div className="sm:col-span-2 rounded-lg bg-emerald-50/70 p-3 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <dt className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>UPI ID / VPA (Virtual Payment Address)</span>
                    </dt>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(upiAddress, "upi_id")}
                      className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded hover:bg-emerald-200 transition cursor-pointer"
                    >
                      {copiedKey === "upi_id" ? "Copied" : "Copy UPI ID"}
                    </button>
                  </div>
                  <dd className="font-mono text-xs font-bold text-emerald-950 mt-1 select-all break-all">
                    {upiAddress}
                  </dd>
                </div>
              )}

              {/* Transaction ID / Razorpay Payment ID */}
              {(payment.razorpay_payment_id || payment.gateway_ref) && (
                <div className="sm:col-span-2 rounded-lg bg-ink-50 p-2.5 border border-ink-200/70">
                  <div className="flex items-center justify-between">
                    <dt className="text-[11px] font-semibold text-ink-500">Transaction ID (Payment Reference)</dt>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(payment.razorpay_payment_id || payment.gateway_ref!, "pay_id")}
                      className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer"
                    >
                      {copiedKey === "pay_id" ? "Copied" : "Copy ID"}
                    </button>
                  </div>
                  <dd className="font-mono text-xs font-bold text-ink-900 mt-1 select-all break-all">
                    {payment.razorpay_payment_id || payment.gateway_ref}
                  </dd>
                </div>
              )}

              {payment.razorpay_order_id && (
                <div className="sm:col-span-2 rounded-lg bg-ink-50 p-2.5 border border-ink-200/70">
                  <div className="flex items-center justify-between">
                    <dt className="text-[11px] font-semibold text-ink-500">Razorpay Order ID</dt>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(payment.razorpay_order_id!, "order_id")}
                      className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer"
                    >
                      {copiedKey === "order_id" ? "Copied" : "Copy ID"}
                    </button>
                  </div>
                  <dd className="font-mono text-xs font-bold text-ink-900 mt-1 select-all break-all">
                    {payment.razorpay_order_id}
                  </dd>
                </div>
              )}

              {payment.bank_ref_no && (
                <div className="sm:col-span-2">
                  <dt className="text-ink-400">Bank Reference Number / RRN</dt>
                  <dd className="font-mono text-xs font-semibold text-ink-800 mt-0.5">{payment.bank_ref_no}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Customer Information Card */}
          <div className="card p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-ink-900 border-b border-ink-100 pb-2">
              Customer Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-ink-400">Customer Name</span>
                <p className="font-bold text-ink-900 mt-0.5">{payment.customer_name ?? "—"}</p>
              </div>

              <div>
                <span className="text-ink-400">Phone Number</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="font-semibold text-ink-800 font-mono">{payment.customer_phone ?? "—"}</p>
                  {payment.customer_phone && (
                    <a
                      href={waLink(payment.customer_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-200"
                    >
                      <span>WhatsApp</span>
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              {payment.customer_email && (
                <div className="col-span-2">
                  <span className="text-ink-400">Email</span>
                  <p className="font-medium text-ink-700 mt-0.5">{payment.customer_email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Associated Booking Card */}
          {payment.booking_id && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                <h3 className="font-display font-semibold text-sm text-ink-900">
                  Associated Booking
                </h3>
                <Link
                  href={`/dashboard/bookings/${payment.booking_id}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"
                >
                  <span>View Booking #{payment.booking_no ?? payment.booking_id}</span>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-ink-400">Vehicle</span>
                  <p className="font-bold text-ink-900 mt-0.5">
                    {payment.vehicle_name ?? "Vehicle"} {payment.registration_no ? `(${payment.registration_no})` : ""}
                  </p>
                </div>

                <div>
                  <span className="text-ink-400">Booking Number</span>
                  <p className="font-mono font-bold text-ink-800 mt-0.5">{payment.booking_no ?? `#${payment.booking_id}`}</p>
                </div>

                {payment.pickup_at && (
                  <div>
                    <span className="text-ink-400">Pickup Date</span>
                    <p className="font-medium text-ink-700 mt-0.5">{formatDateTime(payment.pickup_at)}</p>
                  </div>
                )}

                {payment.return_at && (
                  <div>
                    <span className="text-ink-400">Return Date</span>
                    <p className="font-medium text-ink-700 mt-0.5">{formatDateTime(payment.return_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes & Audit History */}
          {payment.notes && (
            <div className="card p-4 space-y-2 bg-ink-50/50">
              <h3 className="font-display font-semibold text-xs text-ink-700">
                Transaction Notes & Remarks
              </h3>
              <p className="text-xs text-ink-800 leading-relaxed font-mono bg-white p-2.5 rounded-lg border border-ink-200">
                {payment.notes}
              </p>
            </div>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="border-t border-ink-100 bg-ink-50 px-6 py-3.5 flex items-center justify-between">
          <div>
            {payment.booking_no && (
              <a
                href={`/invoice/${payment.booking_no}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
              >
                <svg className="h-3.5 w-3.5 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>View Customer Invoice</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isPaid && (
              <button
                type="button"
                disabled={pending}
                onClick={handleMarkPaid}
                className="btn-primary inline-flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
              >
                <span>{pending ? "Saving..." : "Mark as Paid"}</span>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs px-4 py-1.5 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
