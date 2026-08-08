# Production Razorpay Integration — Design Specification

**Date:** 2026-08-08  
**Project:** Darshh Holiday (Darshan Tours Monorepo)  
**Status:** Draft / Pending Review  

---

## 1. System Context & Existing Architecture

The codebase is a Next.js monorepo (`crm` and `web` workspace apps) for vehicle rentals in Sakleshpura & Hassan, Karnataka:

- **`web/` (Port 3000)**: Customer-facing storefront and portal. Server components communicate exclusively with `crm` over HTTP using `GATEWAY_API_KEY` authentication. Has no direct database connection.
- **`crm/` (Port 3001)**: Staff admin portal & sole owner of the SQLite database (`crm/data/darshan.db` using Node.js 22 `DatabaseSync`). Handles quote calculations, bookings, payments, invoices, WhatsApp notifications, and gateway endpoints under `/api/gateway/v1/*`.
- **Database Schema**:
  - `bookings`: Tracks vehicle rentals, total amounts (`base`, `gst`, `deposit`, `total`), payment status (`paid_amount`, `status`).
  - `payments`: Tracks individual payment attempts (`payment_no`, `booking_id`, `amount`, `kind`, `gateway_ref`, `status`, `paid_at`, `receipt_no`).
  - `refunds`: Tracks customer and admin refund requests (`refund_no`, `booking_id`, `payment_id`, `requested_amount`, `approved_amount`, `status`, `transaction_ref`).

---

## 2. Existing Razorpay Implementation Analysis

### 2.1 Current Flow
1. **Order Creation**: Client clicks "Pay Now" on `web` → POST `/api/gateway/v1/payments/order` → `crm/src/lib/payment-actions.ts` (`createBookingPaymentOrder`) calls Razorpay REST API `https://api.razorpay.com/v1/orders` via HTTP Basic Auth. Stores Razorpay `order_id` in `payments.gateway_ref`.
2. **Checkout Modal**: `web` loads `https://checkout.razorpay.com/v1/checkout.js` dynamically and presents the modal to the customer.
3. **Verification**: Upon completion, Razorpay client SDK invokes the frontend handler with `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
4. **Fulfillment**: `web` POSTs signature details to `/api/gateway/v1/payments/verify` → `crm/src/lib/payment-actions.ts` (`verifyBookingPayment`) verifies HMAC-SHA256 signature using `RAZORPAY_KEY_SECRET`. Updates payment to `Paid`, updates booking `paid_amount` and `status = 'Confirmed'`, generates invoice, and dispatches WhatsApp messages + admin push notifications.

### 2.2 Production Gaps & Vulnerabilities
1. **No Asynchronous Webhook Support**: Relying solely on client browser callback `handler` fails if the user closes the window, loses network connection, or experiences browser crash immediately after payment completion on Razorpay.
2. **Missing Webhook Verification**: Without a server-side webhook endpoint (`/api/webhooks/razorpay`) with `RAZORPAY_WEBHOOK_SECRET` validation, payments can be left unconfirmed in the DB while money is captured in Razorpay.
3. **No Direct Razorpay API Refund Execution**: The `refunds` table exists, but staff approval of refunds does not trigger an automated Razorpay API call (`POST https://api.razorpay.com/v1/payments/{payment_id}/refund`).
4. **Environment & Live Key Detection**: Clear distinction between `rzp_test_` and `rzp_live_` environment configurations, validation, and graceful handling.

---

## 3. Proposed Production Architecture & Design

```
                     ┌───────────────────────┐
                     │   Razorpay Gateway    │
                     └──────────┬────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          │ (Client Modal Callback)                   │ (Async Server Webhook)
          ▼                                           ▼
┌───────────────────┐                       ┌───────────────────┐
│  web (Port 3000)  │                       │   crm / API       │
│ Client Browser    │                       │ /api/webhooks/    │
└─────────┬─────────┘                       │    razorpay       │
          │                                 └─────────┬─────────┘
          │ (POST /v1/payments/verify)                │
          └─────────────────────┬─────────────────────┘
                                │
                                ▼
                     ┌───────────────────────┐
                     │ CRM Payment Verification│
                     │  & Idempotent Handler │
                     └──────────┬────────────┘
                                │
                                ▼
                     ┌───────────────────────┐
                     │ SQLite (darshan.db)   │
                     │ Payments / Bookings   │
                     └───────────────────────┘
```

### 3.1 Razorpay Server-to-Server Webhook Handler
- **Endpoint**: `/api/webhooks/razorpay` (or `/api/gateway/v1/payments/webhook`) on `crm`.
- **Signature Verification**: Validates `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` using `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
- **Supported Events**:
  - `payment.captured` / `order.paid`: Executes idempotent verification (`verifyBookingPayment` or dedicated handler). If already marked `Paid`, gracefully skips without duplicate processing.
  - `payment.failed`: Updates `payments.status = 'Failed'` and logs failure reason.
  - `refund.processed`: Updates matching `refunds` row to `status = 'Completed'` and sets `transaction_ref`.

### 3.2 Automated Razorpay Refunds API Integration
- **Function**: `issueRazorpayRefund(paymentId, amount, reason)` in `crm/src/lib/razorpay.ts`.
- **API Call**: POST `https://api.razorpay.com/v1/payments/{razorpay_payment_id}/refund` with `{ amount: amountInPaise, notes: { refund_no, booking_no } }`.
- **Integration Point**: Triggered when a staff/admin user approves a refund in CRM dashboard or when an automated cancellation refund rule is processed.

### 3.3 Enhanced Payment Verification & Idempotency
- Ensures signature check, status checks, and amount match verification are strictly idempotent.
- Double verification prevention: `if (payment.status === 'Paid') return { ok: true, bookingNo }`.

### 3.4 Environment & Key Management
- Support both Test (`rzp_test_...`) and Live (`rzp_live_...`) credentials seamlessly.
- Configurable environment variables:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID`

---

## 4. Security, Isolation & Error Handling

1. **HMAC Timing-Safe Verification**: All signature checks use `crypto.timingSafeEqual` to prevent timing attacks.
2. **Zero Client Secret Exposure**: `web` app only receives `keyId` and `orderId`. Secrets never leave `crm` server environment.
3. **Database Integrity**: All payment status updates, booking status changes, and history insertions run in atomic database transactions.
4. **Best-effort Non-blocking Messaging**: Failures in WhatsApp template messaging do not block or rollback payment verification.

---

## 5. Verification & Testing Strategy

1. **Unit Testing Razorpay Verification**: Test signature generation and verification logic with mock secrets and payloads.
2. **Webhook Event Simulation**: Simulate `order.paid`, `payment.captured`, and `payment.failed` webhook payloads with valid HMAC signatures.
3. **End-to-End Test Checkout Flow**: Verify order creation, frontend script loading, modal open triggers, verification, invoice generation, and status transitions.
