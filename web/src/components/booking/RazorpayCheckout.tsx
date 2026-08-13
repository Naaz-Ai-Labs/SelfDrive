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
  /** Deposit-EXCLUDED figure. This is what Razorpay charges — never the all-in total. */
  amountDue: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quote?: {
    days: number;
    baseAmount: number;
    offSchedulePickupFee?: number;
    gstPct: number;
    gstAmount: number;
    depositAmount: number;
    gatewayFeeAmount: number;
    totalAmount: number;
    payableNow?: number;
    depositPayableAtPickup?: number;
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
    const order = await createBookingPaymentOrder(bookingId, amountDue, quote);
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
      description: `Rental + GST — ${order.paymentNo}`,
      order_id: order.orderId,
      notes: (order as { notes?: Record<string, string> }).notes ?? {
        "Base Rental": quote ? `₹${quote.baseAmount.toLocaleString("en-IN")}` : `₹${amountDue.toLocaleString("en-IN")}`,
        "GST (6%)": quote ? `₹${quote.gstAmount.toLocaleString("en-IN")}` : "Included",
        "Deposit (cash at pickup, NOT in this payment)": quote ? `₹${(quote.depositPayableAtPickup ?? quote.depositAmount).toLocaleString("en-IN")}` : "Collected at pickup",
        "Paid Online Now": `₹${amountDue.toLocaleString("en-IN")}`,
      },
      prefill: { name: customerName, contact: customerPhone, email: customerEmail || undefined },
      theme: { color: "#f2b705" },
      config: {
        display: {
          hide: [
            { method: "emi" },
            { method: "paylater" },
          ],
        },
      },
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
          <p className="font-bold text-ink-950 text-base">Pay now online: {formatINR(amountDue)}</p>
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
                {Boolean(quote.offSchedulePickupFee && quote.offSchedulePickupFee > 0) && (
                  <div className="flex justify-between text-amber-800">
                    <span>Off-schedule Timing Surcharge</span>
                    <span className="font-semibold">{formatINR(quote.offSchedulePickupFee!)}</span>
                  </div>
                )}
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
                <div className="flex justify-between border-t border-brand-300 pt-2 text-sm font-bold text-ink-950">
                  <span>Pay now online</span>
                  <span>{formatINR(quote.payableNow ?? amountDue)}</span>
                </div>
                <div className="flex justify-between text-emerald-800">
                  <span>Security deposit (cash at pickup, refundable)</span>
                  <span className="font-semibold">{formatINR(quote.depositPayableAtPickup ?? quote.depositAmount)}</span>
                </div>
                <p className="text-[11px] text-ink-500">
                  The deposit is not part of this online payment — you pay it in cash when you collect the vehicle.
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-between font-medium">
                  <span>Rental + GST (paid online now)</span>
                  <span className="font-bold text-ink-900">{formatINR(amountDue)}</span>
                </div>
                <p className="text-[11px] text-ink-500">
                  The refundable security deposit is collected separately in cash at pickup.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="field-error" role="alert">{error}</p>}

      <div>
        <button
          type="button"
          onClick={payNow}
          disabled={status === "loading"}
          className="btn-shine inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-4 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "loading" ? "Opening secure checkout…" : "Pay with Razorpay"}
        </button>
      </div>
    </div>
  );
}
