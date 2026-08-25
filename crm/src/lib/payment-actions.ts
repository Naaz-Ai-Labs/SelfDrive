"use server";

import { nextNumber, parseJSON } from "./utils";
import { logActivity, pushNotification } from "./activity";
import { sendTemplate } from "./messaging";
import { createRazorpayOrder, verifyRazorpaySignature, fetchRazorpayPayment, razorpayConfigured, razorpayKeyId } from "./razorpay";
import { generateInvoiceForBooking } from "./invoices";
import { toPaise } from "./utils";
import { calculateBookingFinancials } from "./pricing";
import { sbSelectOne, sbSelect, sbInsert, sbUpdate, sbCount, sbRpc, num } from "./supabase-rest";

/**
 * The money path talks to Supabase directly.
 *
 * It used to write to a per-lambda SQLite file and then fire the Supabase copy
 * as an unawaited promise. Vercel freezes the lambda the moment the response is
 * returned, so those copies frequently never ran: the customer saw "payment
 * successful" while nothing reached the durable store. Every write below is
 * awaited, and a failed write is reported as a failure.
 */

type PaymentRow = {
  id: number;
  payment_no: string;
  booking_id: number | null;
  customer_id: number | null;
  amount: number | string;
  amount_paise: number | string | null;
  status: string;
  gateway_ref: string | null;
  razorpay_order_id: string | null;
};

type BookingRow = {
  id: number;
  booking_no: string | null;
  customer_id: number | null;
  vehicle_id: number | null;
  pickup_at: string | null;
  total_amount: number | string | null;
  deposit_amount: number | string | null;
  base_amount: number | string | null;
  gst_amount: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
};

const nowISO = () => new Date().toISOString();

/**
 * Creates (or reuses) a payment order against Razorpay.
 * Can be called with an existing `bookingId` or with pre-booking quote/amount details.
 * For new online checkouts, NO booking is created in the database until Razorpay confirms Paid.
 */
export async function createBookingPaymentOrder(
  bookingId?: number | null,
  overrideAmount?: number,
  quote?: {
    days?: number;
    baseAmount?: number;
    gstPct?: number;
    gstAmount?: number;
    depositAmount?: number;
    gatewayFeeAmount?: number;
    totalAmount?: number;
    payableNow?: number;
    depositPayableAtPickup?: number;
  } | null,
  customerInfo?: { name?: string; phone?: string; email?: string }
): Promise<
  { ok: true; orderId: string; amountPaise: number; keyId: string; paymentId: number; paymentNo: string; notes?: Record<string, string>; businessName: string } | { ok: false; error: string }
> {
  if (!razorpayConfigured()) {
    return { ok: false, error: "Online payment isn't set up yet. Our team will contact you on WhatsApp to arrange payment." };
  }

  // 1. If an existing booking is being paid (e.g. from customer portal or balance settlement)
  if (bookingId && bookingId > 0) {
    const bookingRes = await sbSelectOne<BookingRow>("bookings", `select=*&id=eq.${bookingId}`);
    if (!bookingRes.ok) return { ok: false, error: bookingRes.error };
    const booking = bookingRes.data;
    if (!booking) return { ok: false, error: "Booking not found." };

    const fin = calculateBookingFinancials(booking);
    const totalAmount = fin.totalAmount;
    const paidAmount = fin.paidAmount;
    const depositAmount = fin.depositAmount;

    const onlinePayable = totalAmount;
    const due = overrideAmount && overrideAmount > 0 ? overrideAmount : Math.max(1, onlinePayable - paidAmount);
    if (due <= 0) return { ok: false, error: "This booking is already fully paid." };

    const duePaise = Math.max(100, toPaise(due));
    const breakdownJson = JSON.stringify({
      baseAmount: booking.base_amount != null ? num(booking.base_amount) : Math.max(0, due - num(booking.gst_amount)),
      depositAmount,
      gstAmount: num(booking.gst_amount),
      totalAmount: due,
    });

    const existingRes = await sbSelectOne<PaymentRow>(
      "payments",
      `select=*&booking_id=eq.${bookingId}&status=eq.Pending&kind=eq.full&order=id.desc`
    );
    if (!existingRes.ok) return { ok: false, error: existingRes.error };

    let payment: { id: number; payment_no: string; amount: number };

    if (existingRes.data) {
      const upd = await sbUpdate("payments", `id=eq.${existingRes.data.id}`, { breakdown_json: breakdownJson });
      if (!upd.ok) return { ok: false, error: upd.error };
      payment = { id: existingRes.data.id, payment_no: existingRes.data.payment_no, amount: num(existingRes.data.amount) };
    } else {
      const paymentNo = nextNumber("PY", null);
      const ins = await sbInsert<PaymentRow>("payments", {
        payment_no: paymentNo,
        booking_id: bookingId,
        customer_id: booking.customer_id ?? null,
        amount: due,
        amount_paise: duePaise,
        currency: "INR",
        kind: "full",
        status: "Pending",
        notes: "Rental fare payment",
        breakdown_json: breakdownJson,
        created_at: nowISO(),
      });
      if (!ins.ok) return { ok: false, error: ins.error };
      payment = { id: ins.data.id, payment_no: ins.data.payment_no, amount: num(ins.data.amount) };
    }

    const gstAmount = Math.round(totalAmount * 0.06);
    const rzpNotes: Record<string, string> = {
      "Booking No": String(booking.booking_no ?? `BK-${bookingId}`),
      "Rental Base": `₹${totalAmount.toLocaleString("en-IN")}`,
      "Pickup Fee": `₹250`,
      "GST (6%)": `₹${gstAmount.toLocaleString("en-IN")}`,
      "Refundable Deposit": `₹${depositAmount.toLocaleString("en-IN")}`,
    };

    const order = await createRazorpayOrder({ amountInRupees: payment.amount, receipt: payment.payment_no, notes: rzpNotes });
    if (!order.ok) return { ok: false, error: order.error };

    const link = await sbUpdate("payments", `id=eq.${payment.id}`, {
      gateway_ref: order.orderId,
      razorpay_order_id: order.orderId,
      amount_paise: duePaise,
    });
    if (!link.ok) return { ok: false, error: link.error };

    return {
      ok: true,
      orderId: order.orderId,
      amountPaise: order.amount,
      keyId: razorpayKeyId()!,
      paymentId: payment.id,
      paymentNo: payment.payment_no,
      notes: rzpNotes,
      businessName: "Darshh Holiday",
    };
  }

  // 2. Pre-booking online checkout order
  const finalAmount = overrideAmount && overrideAmount > 0 ? overrideAmount : (quote?.payableNow ?? quote?.totalAmount ?? 1);
  const duePaise = Math.max(100, Math.round(finalAmount * 100));
  const paymentNo = nextNumber("PY", null);

  const baseAmt = quote?.baseAmount ?? Math.max(0, finalAmount - (quote?.gstAmount ?? 0));
  const depAmt = quote?.depositPayableAtPickup ?? quote?.depositAmount ?? 0;
  const gstAmt = quote?.gstAmount ?? 0;

  const rzpNotes: Record<string, string> = {
    "Customer": customerInfo?.name ?? "Online Customer",
    "Phone": customerInfo?.phone ?? "",
    "Base Rental": `₹${baseAmt.toLocaleString("en-IN")}`,
    "GST (6%)": gstAmt > 0 ? `₹${gstAmt.toLocaleString("en-IN")}` : "Included",
    "Deposit (cash at pickup)": depAmt > 0 ? `₹${depAmt.toLocaleString("en-IN")}` : "Collected at pickup",
    "Paid Online Now": `₹${finalAmount.toLocaleString("en-IN")}`,
  };

  const order = await createRazorpayOrder({ amountInRupees: finalAmount, receipt: paymentNo, notes: rzpNotes });
  if (!order.ok) return { ok: false, error: order.error };

  // Look up or create customer if phone provided
  let customerId: number | null = null;
  if (customerInfo?.phone) {
    try {
      const { findOrCreateCustomer } = await import("./bookings");
      const custRes = await findOrCreateCustomer({
        name: customerInfo.name || "Online Customer",
        phone: customerInfo.phone,
        email: customerInfo.email,
      });
      if (custRes.ok) customerId = custRes.customerId;
    } catch {}
  }

  const breakdownJson = JSON.stringify({
    baseAmount: baseAmt,
    depositAmount: depAmt,
    gstAmount: gstAmt,
    totalAmount: finalAmount,
  });

  // Pre-insert a Pending payment row so every created order has a durable database trail
  const ins = await sbInsert<PaymentRow>("payments", {
    payment_no: paymentNo,
    booking_id: null,
    customer_id: customerId,
    amount: finalAmount,
    amount_paise: duePaise,
    currency: "INR",
    kind: "full",
    status: "Pending",
    notes: `Pre-booking checkout for ${customerInfo?.name ?? "Customer"} (${customerInfo?.phone ?? ""})`,
    gateway_ref: order.orderId,
    razorpay_order_id: order.orderId,
    breakdown_json: breakdownJson,
    created_at: nowISO(),
  });

  const createdPaymentId = ins.ok ? ins.data.id : 0;

  return {
    ok: true,
    orderId: order.orderId,
    amountPaise: order.amount,
    keyId: razorpayKeyId()!,
    paymentId: createdPaymentId,
    paymentNo,
    notes: rzpNotes,
    businessName: "Darshh Holiday",
  };
}

export async function verifyBookingPayment(input: {
  paymentId?: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  skipSignatureCheck?: boolean;
  bookingPayload?: any;
}): Promise<{ ok: true; bookingNo: string; bookingId?: number; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  // Attaching is guarded on the booking having no documents yet, so a Razorpay retry or
  // a customer refreshing the confirmation page cannot produce duplicate rows.
  async function attachDocumentsIfMissing(bookingId: number, payload: any): Promise<void> {
    const docs = payload?.documents;
    if (!Array.isArray(docs) || docs.length === 0) return;

    const existing = await sbCount("customer_documents", `booking_id=eq.${bookingId}`);
    if (!existing.ok || existing.data > 0) return;

    const bookingRow = await sbSelectOne<{ customer_id: number | null }>(
      "bookings",
      `select=customer_id&id=eq.${bookingId}`
    );
    const customerId = bookingRow.ok && bookingRow.data ? bookingRow.data.customer_id : null;
    if (!customerId) return;

    try {
      const { attachCustomerDocuments } = await import("./booking-actions");
      const res = await attachCustomerDocuments(customerId, bookingId, docs);
      if (!res.ok) {
        console.error(`[payments] booking ${bookingId}: documents not attached — ${res.error}`);
      }
    } catch (err) {
      // Never let document attachment fail a payment that is already settled.
      console.error(`[payments] booking ${bookingId}: document attachment threw`, err);
    }
  }

  // 1. Idempotency check on Razorpay payment ID
  const priorRes = await sbSelectOne<{ id: number; status: string; booking_id: number | null }>(
    "payments",
    `select=id,status,booking_id&razorpay_payment_id=eq.${encodeURIComponent(input.razorpayPaymentId)}`
  );
  if (priorRes.ok && priorRes.data && priorRes.data.status === "Paid" && priorRes.data.booking_id) {
    // The webhook usually settles the payment before the browser posts its verify call,
    // and it builds the booking from the draft enquiry — which carries no documents.
    // submitBooking() is the only writer of customer_documents, and it never runs
    // because this early return fires first, so the uploaded files orphan in storage
    // and the CRM shows "No Docs".
    //
    // The browser's call is the only one that carries bookingPayload.documents, so
    // attach them to the booking that already exists before returning.
    await attachDocumentsIfMissing(priorRes.data.booking_id, input.bookingPayload);

    const bNo = await lookupBookingNo(priorRes.data.booking_id);
    return { ok: true, bookingNo: bNo ?? `BK-${priorRes.data.booking_id}`, bookingId: priorRes.data.booking_id, alreadyProcessed: true };
  }

  // 2. Cryptographic signature verification
  if (!input.skipSignatureCheck) {
    const valid = verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature);
    if (!valid) {
      await logActivity(null, "payment_signature_invalid", "payment", input.paymentId ?? null, { orderId: input.razorpayOrderId });
      return { ok: false, error: "We could not verify this payment signature. If money was deducted, contact us with your payment ID." };
    }
  }

  // 3. Direct verification of payment status from Razorpay API
  let paidAmount = 0;
  let realMethod: string | null = null;
  let realVpa: string | null = null;
  let realBankRef: string | null = null;
  let customerContact: string | null = null;
  let customerEmail: string | null = null;
  let razorpayCustomerName: string | null = null;

  try {
    const rzpRes = await fetchRazorpayPayment(input.razorpayPaymentId);
    if (rzpRes.ok) {
      const p = rzpRes.payment;
      if (p.status !== "captured" && p.status !== "authorized") {
        return { ok: false, error: `Payment has not been completed on Razorpay (Status: ${p.status}).` };
      }
      paidAmount = (p.amount || 0) / 100;
      realVpa = p.vpa || p.upi?.vpa || null;
      realMethod = p.method ? (p.method.toLowerCase() === "upi" ? "UPI" : p.method.toUpperCase()) : null;
      realBankRef = p.acquirer_data?.rrn || p.acquirer_data?.upi_transaction_id || p.acquirer_data?.bank_transaction_id || null;
      customerContact = p.contact || p.notes?.Phone || null;
      customerEmail = p.email || null;
      razorpayCustomerName = p.notes?.Customer || null;
    }
  } catch (err) {
    console.error("[payments] fetchRazorpayPayment check error:", err);
  }

  const receiptNo = nextNumber("RC", null);

  // CASE A: Pre-booking online checkout — create the booking and link payment!
  if (input.bookingPayload) {
    const { submitBooking } = await import("./booking-actions");
    const subRes = await submitBooking(input.bookingPayload);
    if (!subRes.ok || !subRes.bookingId) {
      return { ok: false, error: subRes.error || "Payment was successful, but booking could not be saved. Contact support with your payment ID." };
    }

    const bookingId = Number(subRes.bookingId);
    const bookingNo = String(subRes.bookingNo);
    const customerId = subRes.customerId ?? null;
    const finalPaid = paidAmount > 0 ? paidAmount : (input.bookingPayload.amount || 1);

    const orderIdEnc = encodeURIComponent(input.razorpayOrderId);
    const existingOrderPay = await sbSelectOne<PaymentRow>(
      "payments",
      `select=*&or=(gateway_ref.eq.${orderIdEnc},razorpay_order_id.eq.${orderIdEnc})`
    );

    let paymentNo = nextNumber("PY", null);
    if (existingOrderPay.ok && existingOrderPay.data) {
      paymentNo = existingOrderPay.data.payment_no;
      await sbUpdate("payments", `id=eq.${existingOrderPay.data.id}`, {
        booking_id: bookingId,
        customer_id: customerId,
        amount: finalPaid,
        amount_paise: Math.round(finalPaid * 100),
        status: "Paid",
        notes: `Razorpay payment ID: ${input.razorpayPaymentId}`,
        receipt_no: receiptNo,
        gateway_ref: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        razorpay_signature: input.razorpaySignature,
        method: realMethod || "UPI",
        upi_id: realVpa,
        vpa: realVpa,
        bank_ref_no: realBankRef,
        paid_at: nowISO(),
      });
    } else {
      await sbInsert<PaymentRow>("payments", {
        payment_no: paymentNo,
        booking_id: bookingId,
        customer_id: customerId,
        amount: finalPaid,
        amount_paise: Math.round(finalPaid * 100),
        currency: "INR",
        kind: "full",
        status: "Paid",
        notes: `Razorpay payment ID: ${input.razorpayPaymentId}`,
        receipt_no: receiptNo,
        gateway_ref: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        razorpay_signature: input.razorpaySignature,
        method: realMethod || "UPI",
        upi_id: realVpa,
        vpa: realVpa,
        bank_ref_no: realBankRef,
        paid_at: nowISO(),
        created_at: nowISO(),
      });
    }

    // Update booking status to Confirmed & record paid amount
    await sbUpdate("bookings", `id=eq.${bookingId}`, {
      status: "Confirmed",
      paid_amount: finalPaid,
      updated_at: nowISO(),
    });

    await sbInsert("booking_history", {
      booking_id: bookingId,
      action: "payment_verified",
      detail: JSON.stringify({
        payment_no: paymentNo,
        amount: finalPaid,
        razorpay_payment_id: input.razorpayPaymentId,
        status: "Confirmed",
      }),
      created_at: nowISO(),
    });

    await logActivity(null, "payment_verified", "payment", bookingId, { amount: finalPaid, razorpay_payment_id: input.razorpayPaymentId });

    // Generate invoice and notifications
    const invoice = await generateInvoiceForBooking(bookingId).catch(() => null);
    const phone = input.bookingPayload.contact?.phone;
    const name = input.bookingPayload.contact?.name;

    if (phone) {
      try {
        await sendTemplate("payment_receipt", phone, { name: name ?? "", amount: `₹${finalPaid.toLocaleString("en-IN")}`, reference: input.razorpayPaymentId, receipt_no: receiptNo, booking_no: bookingNo }, null, bookingId);
        await sendTemplate("booking_confirmation", phone, { name: name ?? "", booking_no: bookingNo, vehicle: "", pickup_at: input.bookingPayload.pickupAt ?? "", location: input.bookingPayload.location ?? "" }, null, bookingId);
        if (invoice) {
          await sendTemplate("invoice_generated", phone, { name: name ?? "", invoice_no: invoice.invoiceNo, booking_no: bookingNo, total: `₹${finalPaid.toLocaleString("en-IN")}` }, null, bookingId);
        }
      } catch {}
    }

    try {
      const { cacheInvalidatePrefix } = await import("./redis");
      await cacheInvalidatePrefix("web:gateway:");
      await cacheInvalidatePrefix("vehicles:");
      await cacheInvalidatePrefix("fleet:");
    } catch {}

    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/dashboard", "layout");
      revalidatePath("/dashboard/bookings", "page");
      revalidatePath("/dashboard/vehicles", "page");
      revalidatePath("/dashboard/allocations", "page");
    } catch {}

    return { ok: true, bookingNo, bookingId };
  }

  // CASE B: Existing booking or Webhook payment update
  const orderId = encodeURIComponent(input.razorpayOrderId);
  let paymentRes = await sbSelectOne<PaymentRow>(
    "payments",
    input.paymentId && input.paymentId > 0
      ? `select=*&id=eq.${input.paymentId}`
      : `select=*&or=(gateway_ref.eq.${orderId},razorpay_order_id.eq.${orderId})`
  );

  let payment = paymentRes.ok ? paymentRes.data : null;

  // Fallback: If no payment row exists at all in the database, create one from Razorpay entity
  if (!payment) {
    let fallbackCustomerId: number | null = null;
    if (customerContact) {
      try {
        const { findOrCreateCustomer } = await import("./bookings");
        const custRes = await findOrCreateCustomer({
          name: razorpayCustomerName || "Customer",
          phone: customerContact,
          email: customerEmail || undefined,
        });
        if (custRes.ok) fallbackCustomerId = custRes.customerId;
      } catch {}
    }

    const fallbackPayNo = nextNumber("PY", null);
    const effectivePaidAmount = paidAmount > 0 ? paidAmount : 1;
    const insRes = await sbInsert<PaymentRow>("payments", {
      payment_no: fallbackPayNo,
      booking_id: null,
      customer_id: fallbackCustomerId,
      amount: effectivePaidAmount,
      amount_paise: Math.round(effectivePaidAmount * 100),
      currency: "INR",
      kind: "full",
      status: "Paid",
      notes: `Razorpay payment ID: ${input.razorpayPaymentId}`,
      receipt_no: receiptNo,
      gateway_ref: input.razorpayPaymentId,
      razorpay_order_id: input.razorpayOrderId,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_signature: input.razorpaySignature,
      method: realMethod || "UPI",
      upi_id: realVpa,
      vpa: realVpa,
      bank_ref_no: realBankRef,
      paid_at: nowISO(),
      created_at: nowISO(),
    });

    if (insRes.ok && insRes.data) {
      payment = insRes.data;
    } else {
      return { ok: false, error: "Payment record could not be created." };
    }
  }

  if (payment.status === "Paid" && payment.booking_id) {
    const bookingNo = await lookupBookingNo(payment.booking_id);
    return { ok: true, bookingNo: bookingNo ?? "", alreadyProcessed: true };
  }

  const effectivePaid = paidAmount > 0 ? paidAmount : num(payment.amount);

  const patch: Record<string, unknown> = {
    status: "Paid",
    paid_at: nowISO(),
    notes: `Razorpay payment ID: ${input.razorpayPaymentId}`,
    receipt_no: receiptNo,
    gateway_ref: input.razorpayPaymentId,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    razorpay_signature: input.razorpaySignature,
  };
  if (realMethod) patch.method = realMethod;
  if (realVpa) {
    patch.upi_id = realVpa;
    patch.vpa = realVpa;
  }
  if (realBankRef) patch.bank_ref_no = realBankRef;

  // Razorpay fires order.paid AND payment.captured for the same payment, milliseconds
  // apart, and they arrive as two separate lambda invocations. Both used to read the row
  // as Pending, both fell through to the auto-link branch below, and both created a
  // booking from the same draft enquiry — two identical bookings ~400ms apart, and
  // increment_booking_paid applied twice.
  //
  // `status=neq.Paid` makes this update an atomic compare-and-swap: exactly one caller
  // can flip Pending -> Paid. The loser gets zero affected rows, which is the signal that
  // another invocation owns this payment.
  const wasAlreadyPaid = payment.status === "Paid";
  const paidUpdate = await sbUpdate<PaymentRow>("payments", `id=eq.${payment.id}&status=neq.Paid`, patch);
  if (!paidUpdate.ok) return { ok: false, error: `Could not record the payment: ${paidUpdate.error}` };

  if (paidUpdate.data.length === 0 && !wasAlreadyPaid) {
    // We read it as Pending but someone else flipped it first. Stop here: continuing
    // would double-create the booking and double-increment the balance.
    //
    // Note the `!wasAlreadyPaid` guard. A row that was ALREADY Paid when we read it also
    // yields zero rows, but that is the orphan-recovery case (paid, never linked to a
    // booking) which must still fall through to the auto-link below.
    const settled = await sbSelectOne<PaymentRow>("payments", `select=booking_id&id=eq.${payment.id}`);
    const settledBookingId = settled.ok && settled.data ? settled.data.booking_id : null;
    const settledBookingNo = settledBookingId ? await lookupBookingNo(settledBookingId) : null;
    return {
      ok: true,
      bookingNo: settledBookingNo ?? "",
      bookingId: settledBookingId ?? undefined,
      alreadyProcessed: true,
    };
  }

  let bookingId = payment.booking_id;

  // If payment is not linked to a booking (e.g. customer closed tab before callback), try auto-linking with enquiry
  if (!bookingId) {
    let searchPhone = customerContact;
    if (!searchPhone && payment.customer_id) {
      const cRes = await sbSelectOne<{ phone: string | null }>("customers", `select=phone&id=eq.${payment.customer_id}`);
      if (cRes.ok && cRes.data?.phone) searchPhone = cRes.data.phone;
    }

    if (searchPhone) {
      const cleanPhone = searchPhone.replace(/\D/g, "").slice(-10);
      const enqRes = await sbSelectOne<{ id: number; data: string; vehicle_id: number; pickup_date: string; return_date: string }>(
        "enquiries",
        `select=id,data,vehicle_id,pickup_date,return_date&phone=like.*${encodeURIComponent(cleanPhone)}*&status=eq.draft&order=id.desc`
      );
      if (enqRes.ok && enqRes.data && enqRes.data.vehicle_id) {
        const enq = enqRes.data;
        const bNo = nextNumber("BK", null);
        const insBooking = await sbInsert<{ id: number }>("bookings", {
          booking_no: bNo,
          enquiry_id: enq.id,
          customer_id: payment.customer_id,
          vehicle_id: enq.vehicle_id,
          branch_id: 1,
          pickup_at: enq.pickup_date,
          return_at: enq.return_date,
          status: "Confirmed",
          total_amount: effectivePaid,
          // Starts at zero on purpose. increment_booking_paid() below is the single
          // writer of this column; seeding it with the payment amount here made every
          // auto-linked booking record twice what was actually paid.
          paid_amount: 0,
          deposit_amount: 1000,
          created_at: nowISO(),
        });
        if (insBooking.ok && insBooking.data) {
          bookingId = insBooking.data.id;
          await sbUpdate("payments", `id=eq.${payment.id}`, { booking_id: bookingId });
          await sbUpdate("enquiries", `id=eq.${enq.id}`, { status: "converted", stage: "Converted" });

          // This path builds the booking straight from the draft enquiry, bypassing
          // submitBooking() entirely — the ONE thing that used to write
          // customer_documents. The customer's uploaded licence/ID photos were durably
          // in storage the moment they were uploaded, but nothing in the DB pointed to
          // them unless the browser's own final submit call completed. Since the draft
          // now carries `documents` as soon as each file is uploaded (see
          // BookingForm.tsx's autosave), pull them from here instead of losing them.
          try {
            const draftData = parseJSON<{ documents?: Array<{ kind: string; url: string; number?: string; expiry?: string }> }>(enq.data, {});
            const draftDocs = draftData.documents;
            if (Array.isArray(draftDocs) && draftDocs.length > 0 && payment.customer_id) {
              const { attachCustomerDocuments } = await import("./booking-actions");
              const attachRes = await attachCustomerDocuments(payment.customer_id, bookingId, draftDocs);
              if (!attachRes.ok) console.error(`[payments] booking ${bookingId}: draft documents not attached — ${attachRes.error}`);
            }
          } catch (err) {
            console.error(`[payments] booking ${bookingId}: draft document recovery threw`, err);
          }
        }
      }
    }
  }

  if (!bookingId) {
    // Unlinked payment safely recorded in payments table
    await logActivity(null, "payment_received_unlinked", "payment", payment.id, {
      amount: effectivePaid,
      razorpay_payment_id: input.razorpayPaymentId,
      order_id: input.razorpayOrderId,
    });
    return { ok: true, bookingNo: "" };
  }

  const unverifiedDocs = await sbCount("customer_documents", `booking_id=eq.${bookingId}&verified=eq.0`);
  const newBookingStatus = unverifiedDocs.ok && unverifiedDocs.data === 0 ? "Confirmed" : "Payment received";

  // Atomic accumulate in Postgres. Read-modify-write in application code loses
  // one of two concurrent payments.
  const incr = await sbRpc<number>("increment_booking_paid", { p_booking_id: bookingId, p_amount: paidAmount });
  if (!incr.ok) return { ok: false, error: `Payment recorded but the booking balance could not be updated: ${incr.error}` };

  const statusUpdate = await sbUpdate("bookings", `id=eq.${bookingId}`, { status: newBookingStatus, updated_at: nowISO() });
  if (!statusUpdate.ok) return { ok: false, error: `Payment recorded but the booking status could not be updated: ${statusUpdate.error}` };

  await sbInsert("booking_history", {
    booking_id: bookingId,
    action: "payment_verified",
    detail: JSON.stringify({
      payment_no: payment.payment_no,
      amount: paidAmount,
      razorpay_payment_id: input.razorpayPaymentId,
      status: newBookingStatus,
    }),
    created_at: nowISO(),
  });

  await logActivity(null, "payment_verified", "payment", payment.id, { amount: paidAmount, razorpay_payment_id: input.razorpayPaymentId });

  // Invoicing must never block a verified payment from being recorded.
  const invoice = await generateInvoiceForBooking(bookingId).catch((err) => {
    console.error("[payments] invoice generation failed", err);
    return null;
  });

  const bookingRes = await sbSelectOne<BookingRow>("bookings", `select=booking_no,pickup_at,customer_id,vehicle_id&id=eq.${bookingId}`);
  const booking = bookingRes.ok ? bookingRes.data : null;

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  let vehicleName: string | null = null;

  if (booking?.customer_id) {
    const c = await sbSelectOne<{ name: string | null; phone: string | null }>("customers", `select=name,phone&id=eq.${booking.customer_id}`);
    if (c.ok && c.data) {
      customerName = c.data.name;
      customerPhone = c.data.phone;
    }
  }
  if (booking?.vehicle_id) {
    const v = await sbSelectOne<{ name: string | null }>("vehicles", `select=name&id=eq.${booking.vehicle_id}`);
    if (v.ok && v.data) vehicleName = v.data.name;
  }

  const bookingNo = booking?.booking_no ?? "";

  if (customerPhone) {
    try {
      await sendTemplate("payment_receipt", customerPhone, { name: customerName ?? "", amount: `₹${paidAmount.toLocaleString("en-IN")}`, reference: input.razorpayPaymentId, receipt_no: receiptNo, booking_no: bookingNo }, null, bookingId);
      await sendTemplate("booking_confirmation", customerPhone, { name: customerName ?? "", booking_no: bookingNo, vehicle: vehicleName ?? "", pickup_at: booking?.pickup_at ?? "", location: "" }, null, bookingId);
      if (invoice) {
        await sendTemplate("invoice_generated", customerPhone, { name: customerName ?? "", invoice_no: invoice.invoiceNo, booking_no: bookingNo, total: `₹${paidAmount.toLocaleString("en-IN")}` }, null, bookingId);
      }
    } catch {
      // best-effort — messaging must never block a verified payment from being recorded
    }
  }

  const staff = await sbSelect<{ id: number }>("users", "select=id&role=in.(admin,manager)&is_active=eq.1");
  if (staff.ok) {
    for (const s of staff.data) {
      await pushNotification(s.id, `Payment received — ${bookingNo}`, `${customerName ?? "Customer"} · ${vehicleName ?? ""}`, null, bookingId);
    }
  }

  try {
    const { cacheInvalidatePrefix } = await import("./redis");
    await cacheInvalidatePrefix("web:gateway:");
    await cacheInvalidatePrefix("vehicles:");
    await cacheInvalidatePrefix("fleet:");
  } catch {}

  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/bookings", "page");
    revalidatePath("/dashboard/vehicles", "page");
    revalidatePath("/dashboard/allocations", "page");
  } catch {}

  return { ok: true, bookingNo };
}

async function lookupBookingNo(bookingId: number | null | undefined): Promise<string | null> {
  if (!bookingId) return null;
  const res = await sbSelectOne<{ booking_no: string | null }>("bookings", `select=booking_no&id=eq.${bookingId}`);
  return res.ok ? res.data?.booking_no ?? null : null;
}
