"use server";

import { gatewayPost } from "./gateway";
import { supabaseRestInsert, supabaseRestSelect, supabaseRestUpsert } from "./supabase-rest";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function createBookingPaymentOrder(
  bookingId?: number | null,
  amountDue?: number,
  quote?: {
    days?: number;
    baseAmount?: number;
    gstPct?: number;
    gstAmount?: number;
    depositAmount?: number;
    gatewayFeeAmount?: number;
    /** All-in disclosure figure (deposit included). NEVER charge this. */
    totalAmount?: number;
    /** Deposit-excluded figure — this is what may be charged online. */
    payableNow?: number;
    depositPayableAtPickup?: number;
  } | null,
  customer?: { name?: string; phone?: string; email?: string }
): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; notes?: Record<string, string>; businessName: string } | { ok: false; error: string }
> {
  // 1. Primary Attempt via CRM Gateway
  try {
    const res = await gatewayPost<any>("/api/gateway/v1/payments/order", { bookingId, amountDue, quote, customer });
    if (res && res.ok && res.orderId) {
      return res;
    }
  } catch (err) {
    console.warn("Gateway payment order proxy error:", err);
  }

  // 2. High-Availability Direct Razorpay Order Creation on Web Server
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { ok: false, error: "Razorpay credentials not configured. Please choose Pay at Pickup." };
  }

  try {
    let finalAmount = Number(amountDue) || (quote?.payableNow ?? quote?.totalAmount ?? 0);
    let bookingNo = bookingId ? `BK-${bookingId}` : "BK-ONLINE";

    if (finalAmount <= 0) {
      finalAmount = 1;
    }

    const amountPaise = Math.max(100, Math.round(finalAmount * 100)); // Minimum 100 paise = ₹1 INR
    const paymentNo = `PY-${Date.now().toString(36).toUpperCase()}`;

    // Itemized notes for Razorpay receipt and customer transparency
    const baseAmt = quote?.baseAmount ?? Math.max(0, finalAmount - (quote?.gstAmount ?? 0));
    const depAmt = quote?.depositPayableAtPickup ?? quote?.depositAmount ?? 0;
    const gstAmt = quote?.gstAmount ?? 0;

    const notes: Record<string, string> = {
      "Customer": customer?.name ?? "Online Customer",
      "Phone": customer?.phone ?? "",
      "Base Rental": `₹${baseAmt.toLocaleString("en-IN")}`,
      "GST (6%)": gstAmt > 0 ? `₹${gstAmt.toLocaleString("en-IN")}` : "Included",
      "Deposit (cash at pickup)": depAmt > 0 ? `₹${depAmt.toLocaleString("en-IN")} — not charged online` : "Collected at pickup",
      "Paid Online Now": `₹${finalAmount.toLocaleString("en-IN")}`,
    };

    // Call Razorpay API directly
    const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: paymentNo,
        notes,
      }),
    });

    const rzpOrder = await rzpRes.json();
    if (!rzpRes.ok || !rzpOrder.id) {
      return { ok: false, error: rzpOrder.error?.description || "Could not create Razorpay order." };
    }

    return {
      ok: true,
      orderId: rzpOrder.id,
      amountPaise,
      keyId,
      paymentId: bookingId ?? 0,
      paymentNo,
      businessName: "Darshh Holiday",
      notes,
    };
  } catch (err: any) {
    console.error("Direct Razorpay order creation error:", err?.message || err);
    return { ok: false, error: "Could not connect to payment gateway. Please choose Pay at Pickup or try again." };
  }
}

export async function verifyBookingPayment(input: {
  paymentId?: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  bookingPayload?: any;
}): Promise<{ ok: true; bookingNo: string; bookingId?: number } | { ok: false; error: string }> {
  // 1. Try CRM Gateway
  try {
    const res = await gatewayPost<any>("/api/gateway/v1/payments/verify", input);
    if (res && res.ok) return res;
  } catch {}

  // 2. Direct HMAC-SHA256 Signature Verification & Live Supabase / CRM Sync
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return { ok: false, error: "Razorpay credentials not configured. Payment could not be verified." };
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== input.razorpaySignature) {
    return { ok: false, error: "Invalid payment signature." };
  }

  // CASE A: Pre-booking online checkout — ONLY create the booking in CRM once payment is verified!
  if (input.bookingPayload) {
    try {
      const { submitBooking } = await import("./booking-actions");
      const subRes = await submitBooking(input.bookingPayload);
      if (!subRes.ok || !subRes.bookingId) {
        return { ok: false, error: subRes.error || "Payment was successful, but booking could not be saved. Contact support with your payment ID." };
      }

      const bookingId = Number(subRes.bookingId);
      const bookingNo = String(subRes.bookingNo);
      const paidAmount = Number(input.bookingPayload.amount || 1000);

      // Record payment
      const paymentNo = `PY-${Date.now().toString(36).toUpperCase()}`;
      await supabaseRestInsert("payments", {
        booking_id: bookingId,
        payment_no: paymentNo,
        kind: "online",
        amount: paidAmount,
        status: "Paid",
        method: "UPI",
        gateway_ref: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        notes: `Razorpay Online Payment verified. Order ID: ${input.razorpayOrderId}, Payment ID: ${input.razorpayPaymentId}`,
        created_at: new Date().toISOString(),
      });

      // Update booking to Confirmed & record paid amount
      await supabaseRestUpsert("bookings", {
        id: bookingId,
        status: "Confirmed",
        paid_amount: paidAmount,
        updated_at: new Date().toISOString(),
      });

      try {
        const { cacheInvalidatePrefix } = await import("./redis");
        await cacheInvalidatePrefix("web:gateway:");
        await cacheInvalidatePrefix("vehicles:");
        await cacheInvalidatePrefix("fleet:");
      } catch {}

      try {
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/", "layout");
        revalidatePath("/vehicles", "page");
        revalidatePath("/booking", "page");
      } catch {}

      return { ok: true, bookingNo, bookingId };
    } catch (err: any) {
      console.error("Direct booking submission after payment error:", err?.message || err);
      return { ok: false, error: "Payment was captured, but booking could not be finalized. Please contact support." };
    }
  }

  // CASE B: Existing booking payment update
  let bookingNo = input.paymentId ? `BK-${input.paymentId}` : "";
  let paidAmount = 1000;

  try {
    const rows = input.paymentId ? await supabaseRestSelect<any>("bookings", `id=eq.${input.paymentId}`) : [];
    let b = rows && rows.length > 0 ? rows[0] : null;

    if (b) {
      bookingNo = b.booking_no || bookingNo;
      const allIn = Number(b.total_amount || 0);
      paidAmount = allIn > 0 ? allIn : Number(b.paid_amount || 0);

      await supabaseRestUpsert("bookings", {
        ...b,
        status: "Confirmed",
        paid_amount: paidAmount,
        updated_at: new Date().toISOString(),
      });
    }

    if (input.paymentId) {
      const paymentNo = `PY-${Date.now().toString(36).toUpperCase()}`;
      await supabaseRestInsert("payments", {
        booking_id: input.paymentId,
        payment_no: paymentNo,
        kind: "online",
        amount: paidAmount,
        status: "Paid",
        method: "UPI",
        gateway_ref: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        notes: `Razorpay Online Payment verified. Order ID: ${input.razorpayOrderId}, Payment ID: ${input.razorpayPaymentId}`,
        created_at: new Date().toISOString(),
      });
    }

    try {
      const { cacheInvalidatePrefix } = await import("./redis");
      await cacheInvalidatePrefix("web:gateway:");
      await cacheInvalidatePrefix("vehicles:");
      await cacheInvalidatePrefix("fleet:");
    } catch {}

    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/", "layout");
      revalidatePath("/vehicles", "page");
      revalidatePath("/booking", "page");
    } catch {}
  } catch (err: any) {
    console.error("Supabase payment verification update error:", err?.message || err);
  }

  return { ok: true, bookingNo };
}
