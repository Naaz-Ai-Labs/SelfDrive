"use server";

import { gatewayPost } from "./gateway";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function createBookingPaymentOrder(bookingId: number): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; notes?: Record<string, string>; businessName: string } | { ok: false; error: string }
> {
  // 1. Primary Attempt via CRM Gateway
  try {
    const res = await gatewayPost<any>("/api/gateway/v1/payments/order", { bookingId });
    if (res && res.ok && res.orderId) {
      return res;
    }
  } catch (err) {
    console.warn("Gateway payment order proxy error:", err);
  }

  // 2. High-Availability Direct Razorpay Order Creation on Web Server
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_live_TMtWnWetF4mEf8";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "vWEQ49WAZ71sye9SJbK5eluA";

  if (!keyId || !keySecret) {
    return { ok: false, error: "Razorpay credentials not configured. Please choose Pay at Pickup." };
  }

  try {
    let amount = 1000;
    let bookingNo = `BK-${bookingId}`;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co";
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: b } = await supabase.from("bookings").select("*, vehicles(*)").eq("id", bookingId).single();
        if (b) {
          bookingNo = b.booking_no || bookingNo;
          amount = Number(b.total_amount || 0) + Number(b.deposit_amount || 0);
          if (amount <= 0 && b.vehicles) {
            amount = Number(b.vehicles.rate_24h || 1000) + Number(b.vehicles.deposit || 1000);
          }
        }
      } catch {}
    }

    const amountPaise = Math.max(100, Math.round(amount * 100)); // in paise (min 100 paise = 1 INR)
    const paymentNo = `PY-${Date.now().toString(36).toUpperCase()}`;

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
        notes: {
          booking_id: String(bookingId),
          booking_no: bookingNo,
        },
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
      paymentId: bookingId,
      paymentNo,
      businessName: "Darshh Holiday",
      notes: {
        "Booking No": bookingNo,
      },
    };
  } catch (err: any) {
    console.error("Direct Razorpay order creation error:", err?.message || err);
    return { ok: false, error: "Could not connect to payment gateway. Please choose Pay at Pickup or try again." };
  }
}

export async function verifyBookingPayment(input: {
  paymentId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: true; bookingNo: string } | { ok: false; error: string }> {
  // 1. Try CRM Gateway
  try {
    const res = await gatewayPost<any>("/api/gateway/v1/payments/verify", input);
    if (res && res.ok) return res;
  } catch {}

  // 2. Direct HMAC-SHA256 Signature Verification
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "vWEQ49WAZ71sye9SJbK5eluA";

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== input.razorpaySignature) {
    return { ok: false, error: "Invalid payment signature." };
  }

  // Update Supabase booking status to Confirmed
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co";
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("bookings").update({ status: "Confirmed", paid_amount: 1 }).eq("id", input.paymentId);
    } catch {}
  }

  return { ok: true, bookingNo: `BK-${input.paymentId}` };
}
