# Design Document - Inline Payment Invoice & PDF Download Integration

## Goal
Automatically generate and render an itemized tax invoice directly on the payment success screen when a payment is made, and provide a 1-click **Download / Save as PDF** option.

---

## Architecture & Data Flow

1. **Payment Verification**:
   - When a payment is completed on the web booking flow, `verifyBookingPayment` updates the booking to `Confirmed` and records the payment in the ledger.
   - It generates an invoice payload containing invoice number (`INV-2026-XXXXX`), payment ID, itemized rates, GST, deposit, and customer/business details.

2. **Inline Invoice Display (`BookingForm.tsx`)**:
   - In Step 6 of `BookingForm.tsx` (when `paid === true`), instead of showing a generic success message, display an **Inline Tax Invoice Card**.
   - The card shows:
     - Header: Company Name, GSTIN, Address, Booking No, Invoice No, Date & Payment ID.
     - Customer details: Name, Phone, Email.
     - Itemized Table: Base Vehicle Rental, Timing/Delivery Surcharges (if any), GST (6%), Refundable Security Deposit, Total Paid.
     - Status: **PAID (Razorpay Online Payment)** badge.

3. **PDF Generation / Print Controls (`InvoicePrintButton.tsx`)**:
   - Include a **"📄 Download PDF Invoice"** button powered by CSS `@media print` rules and `window.print()`, formatted specifically for A4 paper output without header/footer clutter.
   - Provide a direct link button **"👁️ Open Full Page Invoice"** to `/invoice/[bookingNo]`.

---

## Components & Files to Modify

1. **`web/src/components/booking/BookingForm.tsx`**:
   - Render the inline Invoice Card when `paid === true` in step 6.
   - Fetch/calculate invoice details (or use `activeQuote` + booking metadata).
2. **`web/src/components/booking/InlineInvoiceCard.tsx`** [NEW]:
   - Create a clean, beautiful, print-ready tax invoice card component with itemized breakdown, business details, and PDF download action buttons.
3. **`web/src/components/customer/InvoicePrintButton.tsx`**:
   - Ensure styling and trigger support for instant browser PDF save/print.

---

## Verification Plan

1. Complete a test booking flow or render `InlineInvoiceCard` with test payment metadata.
2. Verify that itemized figures (Base, GST, Deposit, Total) match exactly.
3. Click "Download PDF Invoice" to verify print dialog and PDF layout formatting.
