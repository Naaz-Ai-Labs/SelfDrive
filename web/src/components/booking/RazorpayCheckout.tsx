"use client";

import { useEffect, useRef, useState } from "react";
import { createBookingPaymentOrder, verifyBookingPayment, reportPaymentAttemptFailed } from "@/lib/payment-actions";
import { submitBooking } from "@/lib/booking-actions";
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

const MAX_ATTEMPTS = 3;

export function RazorpayCheckout({
  bookingPayload,
  reservationKey,
  amountDue,
  customerName,
  customerPhone,
  customerEmail,
  quote,
  onPaid,
  onExhausted,
  onPayLater,
}: {
  /** Full submitBooking() payload — the reservation is made from this, before any
   * payment attempt, so the booking exists (and holds its physical unit) throughout
   * up to 3 payment attempts instead of being created only after payment succeeds. */
  bookingPayload: any;
  /** One key per logical checkout attempt (crypto.randomUUID(), generated once by the
   * parent and unchanged across retries of the SAME attempt — a double-click or a
   * lost response must return the SAME booking, never reserve a second unit). */
  reservationKey: string;
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
  onPaid: (res: { bookingNo: string; bookingId: number }) => void;
  /** Called once after the 3rd payment attempt is genuinely exhausted — the
   * reservation has already been released server-side by this point. */
  onExhausted?: (reason: "attempts" | "window") => void;
  onPayLater?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "reserving" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [reservedBookingId, setReservedBookingId] = useState<number | undefined>(undefined);
  const [reservedBookingNo, setReservedBookingNo] = useState<string | undefined>(undefined);

  // THE deadline, as issued by the database when the reservation was created. Never
  // recomputed here: a countdown that started its own 15-minute timer on mount would
  // be a second, drifting deadline, and would keep counting after the server had
  // already closed the window (or after attempt 3 released the unit early).
  const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!windowExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [windowExpiresAt]);

  const msLeft = windowExpiresAt ? new Date(windowExpiresAt).getTime() - now : null;
  const windowClosed = msLeft !== null && msLeft <= 0;
  const attemptsLeft = MAX_ATTEMPTS - attemptNumber;

  // The window closing is a terminating condition in its own right — it must return
  // the customer to step 1 on its own, not wait for them to click Pay and be told no.
  // The server has already released the unit by this point; the ref keeps this to a
  // single fire even though the clock ticks every second.
  const expiryHandled = useRef(false);
  useEffect(() => {
    if (!windowClosed || expiryHandled.current) return;
    expiryHandled.current = true;
    onExhausted?.("window");
  }, [windowClosed, onExhausted]);

  /** Idempotent: submitBooking() with the same reservationKey always returns the SAME
   * booking, so calling this again on a later attempt is a no-op fast path once the
   * first call has succeeded. */
  async function ensureReservation(): Promise<number | null> {
    if (reservedBookingId) return reservedBookingId;
    setStatus("reserving");
    const res = await submitBooking({ ...bookingPayload, idempotencyKey: reservationKey });
    if (!res.ok || !res.bookingId) {
      setStatus("error");
      setError(res.error || "Could not reserve this vehicle. Please try again.");
      return null;
    }
    setReservedBookingId(res.bookingId);
    setReservedBookingNo(res.bookingNo);
    setWindowExpiresAt(res.paymentWindowExpiresAt ?? null);
    return res.bookingId;
  }

  async function payNow() {
    // Client-side stop only; the server refuses independently via
    // can_start_payment_attempt(), which is the actual authority.
    if (windowClosed) {
      setStatus("error");
      setError("The 15-minute payment window for this reservation has expired. Please start a new booking.");
      return;
    }
    if (attemptNumber >= MAX_ATTEMPTS) {
      setStatus("error");
      setError("Maximum payment attempts reached for this booking.");
      return;
    }
    setStatus("loading");
    setError("");

    const bookingId = await ensureReservation();
    if (!bookingId) return;

    setStatus("loading");
    // No amount override: the server derives the authoritative charge from THIS
    // booking's own stored total_amount (fixed at reservation time by calculateQuote()
    // inside createBooking()), never from amountDue here — a tampered client value
    // must not be able to change what Razorpay actually charges. amountDue/quote are
    // used only for the Razorpay notes and the on-screen breakdown above.
    const order = await createBookingPaymentOrder(bookingId, undefined, quote, {
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
    });
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
        // No bookingPayload here — the booking already exists (reserved above), so
        // this goes through the existing-booking confirmation path, never creating a
        // second booking.
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
        onPaid({ bookingNo: verify.bookingNo || reservedBookingNo || "", bookingId: verify.bookingId ?? bookingId });
      },
      modal: {
        ondismiss: async () => {
          setStatus("idle");
          const next = attemptNumber + 1;
          setAttemptNumber(next);
          // Backend-verified failure, not a client-side "captured = false" claim — the
          // gateway only ever marks THIS attempt failed and only releases the
          // reservation after independently confirming no successful payment exists.
          try {
            const failRes = await reportPaymentAttemptFailed(order.paymentId);
            if (failRes.ok && failRes.attemptsExhausted) {
              setStatus("error");
              setError("Payment was not completed after 3 attempts. This reservation has been released — please start over.");
              onExhausted?.("attempts");
            }
          } catch {
            // Non-fatal — the customer can still retry; the webhook (if the attempt
            // actually reached Razorpay) is the authoritative backstop either way.
          }
        },
      },
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
            className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-200/80 px-3 py-2 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
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
      {msLeft !== null && (
        <p className={`text-xs font-semibold ${windowClosed ? "text-rose-600" : msLeft < 2 * 60 * 1000 ? "text-amber-700" : "text-ink-500"}`}>
          {windowClosed
            ? "This reservation has expired — please start a new booking."
            : `Reservation held for ${Math.floor(msLeft / 60000)}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0")} · ${attemptsLeft} payment ${attemptsLeft === 1 ? "attempt" : "attempts"} left`}
        </p>
      )}
      {attemptNumber > 0 && attemptNumber < MAX_ATTEMPTS && status !== "error" && (
        <p className="text-xs text-ink-500">Attempt {attemptNumber} of {MAX_ATTEMPTS} did not complete — you can try again.</p>
      )}

      <div>
        <button
          type="button"
          onClick={payNow}
          disabled={status === "loading" || status === "reserving" || attemptNumber >= MAX_ATTEMPTS || windowClosed}
          className="btn-shine inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-4 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "reserving" ? "Reserving your vehicle…" : status === "loading" ? "Opening secure checkout…" : "Pay with Razorpay"}
        </button>
      </div>
    </div>
  );
}
