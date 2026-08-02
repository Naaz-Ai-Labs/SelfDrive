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
  onPaid,
  onPayLater,
}: {
  bookingId: number;
  amountDue: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  onPaid: () => void;
  onPayLater: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

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
      description: `Booking payment — ${order.paymentNo}`,
      order_id: order.orderId,
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
    <div className="space-y-3">
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Amount payable now: {formatINR(amountDue)}</p>
        <p className="mt-1 text-ink-600">Includes the rental total and refundable security deposit. Secure checkout via Razorpay — UPI, cards, netbanking and wallets.</p>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={payNow} disabled={status === "loading"} className="btn-shine inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60">
          {status === "loading" ? "Opening secure checkout…" : "Pay now"}
        </button>
        <button type="button" onClick={onPayLater} className="btn-secondary">
          Pay at pickup instead
        </button>
      </div>
    </div>
  );
}
