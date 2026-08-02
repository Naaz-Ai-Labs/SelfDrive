import crypto from "node:crypto";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

/**
 * Creates a Razorpay order via the REST API directly (no SDK client instantiation needed
 * at import time, so the module loads fine even when keys aren't configured yet).
 */
export async function createRazorpayOrder(input: { amountInRupees: number; receipt: string; notes?: Record<string, string> }): Promise<
  { ok: true; orderId: string; amount: number; currency: string } | { ok: false; error: string }
> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return { ok: false, error: "Online payment isn't set up yet. Our team will contact you to arrange payment." };
  }

  const amountPaise = Math.round(input.amountInRupees * 100);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes ?? {} }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.description ?? "Could not start payment. Please try again." };
    }
    return { ok: true, orderId: data.id, amount: data.amount, currency: data.currency };
  } catch {
    return { ok: false, error: "Could not reach the payment gateway. Please try again." };
  }
}

/** Verifies the HMAC-SHA256 signature Razorpay returns after a successful checkout — this is
 * the only trustworthy confirmation that a payment actually succeeded. Never mark a payment
 * paid without this check passing. */
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
