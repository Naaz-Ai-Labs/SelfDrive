"use client";

import { useState } from "react";
import { formatINR, formatDateTime, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { PaymentDetailModal, type PaymentTransactionData } from "./PaymentDetailModal";
import { MarkPaidButton } from "./forms";

export function BookingPaymentsList({
  payments,
  bookingInfo,
}: {
  payments: Array<Record<string, unknown>>;
  bookingInfo?: {
    booking_no?: string;
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
    vehicle_name?: string;
    registration_no?: string;
    pickup_at?: string;
    return_at?: string;
  };
}) {
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransactionData | null>(null);

  return (
    <div className="space-y-2">
      {payments.map((raw) => {
        const p: PaymentTransactionData = {
          id: Number(raw.id),
          payment_no: String(raw.payment_no),
          booking_id: raw.booking_id ? Number(raw.booking_id) : null,
          booking_no: bookingInfo?.booking_no ?? (raw.booking_no ? String(raw.booking_no) : null),
          customer_name: bookingInfo?.customer_name ?? (raw.customer_name ? String(raw.customer_name) : null),
          customer_phone: bookingInfo?.customer_phone ?? (raw.customer_phone ? String(raw.customer_phone) : null),
          customer_email: bookingInfo?.customer_email ?? (raw.customer_email ? String(raw.customer_email) : null),
          vehicle_name: bookingInfo?.vehicle_name ?? (raw.vehicle_name ? String(raw.vehicle_name) : null),
          registration_no: bookingInfo?.registration_no ?? (raw.registration_no ? String(raw.registration_no) : null),
          pickup_at: bookingInfo?.pickup_at ?? (raw.pickup_at ? String(raw.pickup_at) : null),
          return_at: bookingInfo?.return_at ?? (raw.return_at ? String(raw.return_at) : null),
          amount: Number(raw.amount ?? 0),
          amount_paise: Number(raw.amount_paise ?? 0),
          currency: String(raw.currency ?? "INR"),
          kind: String(raw.kind ?? "advance"),
          method: (raw.method as string) ?? null,
          upi_id: (raw.upi_id as string) ?? (raw.vpa as string) ?? null,
          vpa: (raw.vpa as string) ?? (raw.upi_id as string) ?? null,
          bank_ref_no: (raw.bank_ref_no as string) ?? null,
          gateway_ref: (raw.gateway_ref as string) ?? null,
          razorpay_order_id: (raw.razorpay_order_id as string) ?? null,
          razorpay_payment_id: (raw.razorpay_payment_id as string) ?? null,
          razorpay_signature: (raw.razorpay_signature as string) ?? null,
          due_date: (raw.due_date as string) ?? null,
          paid_at: (raw.paid_at as string) ?? null,
          status: String(raw.status ?? "Pending"),
          notes: (raw.notes as string) ?? null,
          receipt_no: (raw.receipt_no as string) ?? null,
          created_at: (raw.created_at as string) ?? null,
          proof_url: (raw.proof_url as string) ?? null,
        };

        const upi = p.upi_id || p.vpa;

        return (
          <div
            key={p.id}
            onClick={() => setSelectedPayment(p)}
            className="group flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white p-3 text-sm transition hover:border-brand-400 hover:bg-brand-50/20 hover:shadow-xs"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-ink-900 group-hover:text-brand-700">
                  {formatINR(p.amount)}
                </p>
                <span className="rounded bg-ink-100 px-1.5 py-0.2 text-[10px] font-bold text-ink-700 capitalize">
                  {p.kind.replace("_", " ")}
                </span>
                {upi ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 font-mono text-[10px] font-bold text-emerald-800">
                    <svg className="h-2.5 w-2.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>{upi}</span>
                  </span>
                ) : p.method ? (
                  <span className="text-xs text-ink-500 font-medium">· {p.method}</span>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-xs text-ink-500">
                {p.payment_no}
                {p.razorpay_payment_id ? ` · Txn: ${p.razorpay_payment_id}` : ""}
                {p.paid_at ? ` · Paid ${formatDate(p.paid_at)}` : p.due_date ? ` · Due ${formatDate(p.due_date)}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSelectedPayment(p)}
                className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-brand-900 border-brand-200 bg-brand-50 hover:bg-brand-100"
              >
                <span>Details</span>
                <svg className="h-3 w-3 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
              <StatusBadge status={p.status} />
              {p.status !== "Paid" && <MarkPaidButton id={p.id} />}
            </div>
          </div>
        );
      })}

      {payments.length === 0 && (
        <p className="text-sm text-ink-400">No payment entries yet.</p>
      )}

      <PaymentDetailModal
        payment={selectedPayment}
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
}
