"use client";

import { useState } from "react";
import { createBookingPaymentOrder, verifyBookingPayment } from "@/lib/payment-actions";
import { formatINR } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayCheckout({
  bookingId,
  amountDue,
  customerName,
  customerPhone,
  customerEmail,
  quote,
  onPaid,
  onPayLater,
}: {
  bookingId: number;
  amountDue: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quote?: {
    days: number;
    baseAmount: number;
    gstPct: number;
    gstAmount: number;
    depositAmount: number;
    gatewayFeeAmount: number;
    totalAmount: number;
  } | null;
  onPaid: () => void;
  onPayLater: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(true);

  async function payNow() {
    setStatus("loading");
    setError("");
    const order = await createBookingPaymentOrder(bookingId);
    if (!order.ok) {
      setStatus("error");
      setError(order.error);
      return;
    }
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      setStatus("error");
      setError("Could not load the payment window. Check your connection and try again.");
      return;
    }
    setStatus("idle");
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: "INR",
      name: order.businessName,
      description: `Rental + GST + Deposit — ${order.paymentNo}`,
      order_id: order.orderId,
      notes: (order as { notes?: Record<string, string> }).notes ?? {
        "Base Rental": quote ? `₹${quote.baseAmount.toLocaleString("en-IN")}` : "—",
        "Pickup Charge": "₹250",
        "GST (6%)": quote ? `₹${quote.gstAmount.toLocaleString("en-IN")}` : "—",
        "Refundable Deposit": quote ? `₹${quote.depositAmount.toLocaleString("en-IN")}` : "—",
      },
      prefill: { name: customerName, contact: customerPhone, email: customerEmail || undefined },
      theme: { color: "#f2b705" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setStatus("loading");
        const verify = await verifyBookingPayment({
          paymentId: order.paymentId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        if (!verify.ok) {
          setStatus("error");
          setError(verify.error);
          return;
        }
        onPaid();
      },
      modal: { ondismiss: () => setStatus("idle") },
    });
    rzp.open();
  }

  return (
    <div className="space-y-4">
      {/* Collapsible Price Breakdown Card */}
      <div className="rounded-xl border border-brand-300 bg-brand-50/80 p-4 text-sm text-ink-800 shadow-sm transition">
        <div className="flex items-center justify-between">
          <p className="font-bold text-ink-950 text-base">Total payable now: {formatINR(amountDue)}</p>
          <button
            type="button"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-200/80 px-2.5 py-1 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
          >
            <span>{showBreakdown ? "Hide Breakdown ▲" : "View Price Breakdown ▼"}</span>
          </button>
        </div>

        {showBreakdown && (
          <div className="mt-3.5 space-y-2 border-t border-brand-200/90 pt-3 text-xs text-ink-700">
            {quote ? (
              <>
                <div className="flex justify-between">
                  <span>Base Vehicle Rental ({quote.days} day{quote.days > 1 ? "s" : ""})</span>
                  <span className="font-semibold text-ink-900">{formatINR(quote.baseAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mandatory Pickup Handover Charge</span>
                  <span className="font-semibold text-ink-900">₹250</span>
                </div>
                <div className="flex justify-between">
                  <span>GST ({quote.gstPct}%)</span>
                  <span className="font-semibold text-ink-900">{formatINR(quote.gstAmount)}</span>
                </div>
                {quote.gatewayFeeAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Payment Gateway Fee</span>
                    <span className="font-semibold text-ink-900">{formatINR(quote.gatewayFeeAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-800">
                  <span>Refundable Security Deposit</span>
                  <span className="font-semibold">{formatINR(quote.depositAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-brand-300 pt-2 text-sm font-bold text-ink-950">
                  <span>Grand Total</span>
                  <span>{formatINR(quote.totalAmount)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between font-medium">
                <span>Rental + Pickup + GST + Refundable Security Deposit</span>
                <span className="font-bold text-ink-900">{formatINR(amountDue)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={payNow}
          disabled={status === "loading"}
          className="btn-shine inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "loading" ? "Opening secure checkout…" : "Pay with Razorpay"}
        </button>
        <button type="button" onClick={onPayLater} className="btn-secondary flex-1">
          Pay at pickup instead
        </button>
      </div>
    </div>
  );
}
