# Supabase Payment Transaction Ledger — Design Specification

**Date:** 2026-08-08  
**Project:** Darshh Holiday (Darshan Tours Monorepo)  
**Status:** Approved / In Progress  

---

## 1. Executive Summary

This design specification details Phase 12A — Supabase Payment Transaction Ledger. It defines a normalized PostgreSQL financial transaction ledger and an event audit trail table in Supabase (`supabase/schema.sql`) and mirrors it in SQLite (`crm/src/lib/db.ts`). It enforces integer minor units (paise for INR, ₹1,500 = 150000 paise) to eliminate floating-point arithmetic hazards, unique database constraints on Razorpay IDs (`razorpay_order_id`, `razorpay_payment_id`, `event_id`), and seamless Supabase sync upon every payment lifecycle state transition.

---

## 2. Supabase & PostgreSQL Data Schema (`supabase/schema.sql`)

### 2.1 Extended `payments` Ledger Table
```sql
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  payment_no VARCHAR(64) UNIQUE NOT NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL, -- Decimal representation for legacy compatibility
  amount_paise BIGINT NOT NULL,   -- Integer minor units (e.g. ₹1,500.00 = 150000 paise)
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  kind VARCHAR(32) NOT NULL DEFAULT 'full' CHECK (kind IN ('advance', 'full', 'deposit', 'extra_charge')),
  status VARCHAR(32) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Authorized', 'Paid', 'Failed', 'Refunded', 'Cancelled')),
  method VARCHAR(64),
  gateway_ref VARCHAR(128),
  razorpay_order_id VARCHAR(128) UNIQUE,
  razorpay_payment_id VARCHAR(128) UNIQUE,
  razorpay_signature VARCHAR(256),
  gateway_status VARCHAR(64),
  failure_code VARCHAR(64),
  failure_reason TEXT,
  gateway_response JSONB,
  metadata JSONB,
  receipt_no VARCHAR(64) UNIQUE,
  notes TEXT,
  due_date VARCHAR(32),
  paid_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON payments(razorpay_payment_id);
```

### 2.2 `payment_events` Audit Trail & Webhook Idempotency Table
```sql
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  event_id VARCHAR(128) UNIQUE,
  event_type VARCHAR(128) NOT NULL,
  razorpay_order_id VARCHAR(128),
  razorpay_payment_id VARCHAR(128),
  payload JSONB NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT TRUE,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(razorpay_payment_id);
```

---

## 3. Financial Integrity & Integer Minor Units

- **Integer Minor Units Rule**: All internal calculations, Razorpay API payloads, and Supabase ledger persistence use `amount_paise` (integer, e.g. ₹1,500.00 = `150000`).
- **Conversion Helper**:
  ```ts
  export function toPaise(rupees: number): number {
    return Math.round(rupees * 100);
  }
  export function toRupees(paise: number): number {
    return paise / 100;
  }
  ```

---

## 4. Webhook → Supabase Processing Architecture

```
                       ┌──────────────────────┐
                       │   Razorpay Webhook   │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ POST /api/webhooks/  │
                       │       razorpay       │
                       └──────────┬───────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │ Verify X-Razorpay-Signature   │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ Record payment_events log     │
                  │ (event_id UNIQUE check)       │
                  └───────────────┬───────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │ Is Event Duplicate│
                        └─────────┬─────────┘
                       Yes │        │ No
                           │        │
                           ▼        ▼
                      Return 200   Process Payment Update
                                   (amount_paise, status)
                                            │
                                            ▼
                                   Sync to Supabase DB
                                   (& update SQLite DB)
```

---

## 5. Verification & Testing Strategy

1. **Schema Integrity**: Validate SQL syntax in `supabase/schema.sql`.
2. **Integer Minor Unit Precision**: Test exact integer conversion for zero-decimal and non-zero fractional values.
3. **Webhook Idempotency**: Verify duplicate `event_id` payloads are cleanly short-circuited by unique constraint checks.
4. **Supabase Client Sync Test**: Execute sync tests using `@supabase/supabase-js`.
