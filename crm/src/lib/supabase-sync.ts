import { createClient } from "@supabase/supabase-js";
import { getDb } from "./db";

/** Convert Rupees float to integer minor units (Paise). e.g. ₹1500.00 -> 150000 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert integer minor units (Paise) to Rupees float. e.g. 150000 -> 1500 */
export function toRupees(paise: number): number {
  return paise / 100;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Syncs a payment transaction record from local SQLite to Supabase. */
export async function syncPaymentToSupabase(paymentId: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const db = getDb();
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as Record<string, unknown> | undefined;
    if (!payment) return false;

    // Ensure amount_paise is properly set
    const amountPaise = Number(payment.amount_paise) || toPaise(Number(payment.amount) || 0);

    const { error } = await supabase.from("payments").upsert({
      id: payment.id,
      payment_no: payment.payment_no,
      booking_id: payment.booking_id,
      customer_id: payment.customer_id,
      amount: payment.amount,
      amount_paise: amountPaise,
      currency: payment.currency ?? "INR",
      kind: payment.kind ?? "full",
      status: payment.status,
      method: payment.method ?? null,
      gateway_ref: payment.gateway_ref ?? null,
      razorpay_order_id: payment.razorpay_order_id ?? null,
      razorpay_payment_id: payment.razorpay_payment_id ?? null,
      razorpay_signature: payment.razorpay_signature ?? null,
      due_date: payment.due_date ?? null,
      paid_at: payment.paid_at ?? null,
      receipt_no: payment.receipt_no ?? null,
      notes: payment.notes ?? null,
    });

    if (error) {
      console.warn("⚠️ Supabase payment sync warning:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("⚠️ Supabase sync exception:", err?.message || err);
    return false;
  }
}

/**
 * Records a Razorpay webhook payment event in local SQLite and Supabase for audit trailing
 * and idempotency checks.
 * Returns { duplicate: true } if event_id has already been recorded and processed.
 */
export async function recordPaymentEvent(input: {
  eventId?: string | null;
  eventType: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  payload: string;
  signatureVerified: boolean;
  transactionId?: number | null;
}): Promise<{ eventDbId: number; duplicate: boolean }> {
  const db = getDb();

  if (input.eventId) {
    const existing = db.prepare("SELECT id, processed FROM payment_events WHERE event_id = ?").get(input.eventId) as
      | { id: number; processed: number }
      | undefined;
    if (existing) {
      return { eventDbId: existing.id, duplicate: true };
    }
  }

  const result = db
    .prepare(
      `INSERT INTO payment_events (
        transaction_id, event_id, event_type, razorpay_order_id, razorpay_payment_id, payload, signature_verified, processed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      input.transactionId ?? null,
      input.eventId ?? null,
      input.eventType,
      input.razorpayOrderId ?? null,
      input.razorpayPaymentId ?? null,
      input.payload,
      input.signatureVerified ? 1 : 0
    );

  const eventDbId = Number(result.lastInsertRowid);

  // Asynchronously sync payment event to Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from("payment_events")
        .upsert({
          id: eventDbId,
          transaction_id: input.transactionId ?? null,
          event_id: input.eventId ?? null,
          event_type: input.eventType,
          razorpay_order_id: input.razorpayOrderId ?? null,
          razorpay_payment_id: input.razorpayPaymentId ?? null,
          payload: input.payload,
          signature_verified: input.signatureVerified,
          processed: false,
        });
      if (error) console.warn("⚠️ Supabase payment_event sync warning:", error.message);
    } catch {
      // best-effort async sync
    }
  }

  return { eventDbId, duplicate: false };
}

/** Marks a recorded payment event as successfully processed in SQLite and Supabase. */
export async function markPaymentEventProcessed(eventDbId: number, processingError?: string | null): Promise<void> {
  const db = getDb();
  db.prepare("UPDATE payment_events SET processed = 1, processing_error = ?, processed_at = datetime('now') WHERE id = ?").run(
    processingError ?? null,
    eventDbId
  );

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from("payment_events")
        .update({
          processed: true,
          processing_error: processingError ?? null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventDbId);
    } catch {
      // best-effort async sync
    }
  }
}

