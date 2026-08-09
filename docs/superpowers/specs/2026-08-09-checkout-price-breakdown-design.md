# Design Spec — Collapsible Checkout Price Breakdown & Database Transaction Storage

## Executive Summary
This design specification details the implementation of a **Collapsible Price Breakdown Accordion** on Step 6 (Payment) of the booking checkout wizard, as well as full **Database Transaction Logging** in both local SQLite and live Supabase PostgreSQL databases for every payment order, verification, and payment status update.

---

## 1. User Intent & Requirements
1. **Collapsible Price Breakdown Accordion (Option 2)**:
   - On Step 6 ("Payment") and inside the Razorpay Checkout wrapper card, provide a clean, toggleable "View Complete Price Breakdown" accordion.
   - Expanding the accordion reveals an itemized list:
     - 🏍️ / 🚗 **Base Rental**: Number of days × Daily rate breakdown (weekday/weekend split if applicable).
     - 📍 **Mandatory Pickup Handover Charge**: ₹250.
     - 📄 **GST (6%)**: GST amount calculated on base rental + pickup charge.
     - 🛡️ **Refundable Security Deposit**: ₹1,000 (Bikes/Scooters) / ₹2,000 (Cars).
     - 💰 **Total Amount Payable**: Final sum.
2. **Database Transaction Storage**:
   - Store every payment transaction (orders, verified payments, pay-at-pickup records, failed transactions) in both SQLite `darshan.db` and Supabase PostgreSQL `payments` table.
   - Record itemized breakdown JSON in `payments.breakdown_json` for complete auditability.

---

## 2. Technical Architecture & Component Changes

### A. Price Breakdown Accordion (`web/src/components/booking/RazorpayCheckout.tsx`)
- Add a state `showBreakdown` (default: collapsed or auto-expanded for clarity).
- Display a toggleable button: `View Complete Price Breakdown ▾ / ▸`.
- Render itemized rows for:
  - Base rental duration & cost.
  - Pickup handover fee (₹250).
  - GST percentage & tax amount.
  - Security deposit (refundable upon return).
  - Total payable now.

### B. Payment Order Creation & DB Storage (`crm/src/lib/payment-actions.ts`)
- When `createBookingPaymentOrder(bookingId)` is invoked:
  - Compute full itemized pricing quote (`baseAmount`, `pickupFee`, `gstAmount`, `depositAmount`, `totalAmount`).
  - Insert or update a pending row in SQLite `payments` table:
    ```sql
    INSERT INTO payments (booking_id, amount, payment_method, status, gateway_ref, breakdown_json, created_at)
    VALUES (?, ?, 'razorpay', 'Pending', ?, ?, datetime('now'))
    ```
  - Upsert the exact transaction record to Supabase PostgreSQL `payments` table.
  - Record entry in `activity_logs` / `booking_history`.

### C. Payment Verification & Finalizing Transaction (`crm/src/lib/payment-actions.ts`)
- When `verifyBookingPayment` succeeds:
  - Update `payments` status to `'Paid'`, assign `receipt_no`, and save `razorpay_payment_id`.
  - Sync update to Supabase PostgreSQL.
  - Update `bookings` `paid_amount` and `status = 'Confirmed'`.

---

## 3. Database Schema Verification
The `payments` table schema:
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `booking_id`: INTEGER NOT NULL
- `amount`: REAL NOT NULL
- `payment_method`: TEXT DEFAULT 'razorpay'
- `status`: TEXT DEFAULT 'Pending'
- `gateway_ref`: TEXT
- `receipt_no`: TEXT
- `breakdown_json`: TEXT
- `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP

---

## 4. Verification & Testing Plan
1. **Automated Tests**: Run `npx tsx scripts/test-razorpay.ts` to ensure 100% test coverage on payment creation, signature verification, DB logging, and idempotency.
2. **Build Validation**: Run `npm run build` in `crm/` and `web/` to guarantee zero compilation or TypeScript errors.
3. **Database Audit**: Verify that payment rows and breakdown JSON are correctly stored in both SQLite `darshan.db` and Supabase `payments`.
