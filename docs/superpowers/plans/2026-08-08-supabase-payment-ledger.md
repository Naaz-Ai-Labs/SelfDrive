# Supabase Payment Transaction Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a production-ready PostgreSQL financial transaction ledger and payment event audit trail table in Supabase (`supabase/schema.sql`), mirror schema changes in SQLite (`crm/src/lib/db.ts`), enforce integer minor units (paise for INR), unique constraints (`razorpay_order_id`, `razorpay_payment_id`, `event_id`), and implement server-side Supabase client synchronization.

**Architecture:** Extended `payments` table and new `payment_events` table in `supabase/schema.sql` and `crm/src/lib/db.ts`. Financial amounts are calculated and stored in integer minor units (`amount_paise`). A dedicated `crm/src/lib/supabase-sync.ts` utility syncs payment lifecycle events to Supabase asynchronously or inline upon verification and webhook events.

**Tech Stack:** Next.js, PostgreSQL / Supabase (`@supabase/supabase-js`), Node.js `node:sqlite` (`DatabaseSync`), TypeScript.

---

### Task 1: Complete `supabase/schema.sql` and SQLite Schema Expansion

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `crm/src/lib/db.ts`

**Interfaces:**
- Consumes: PostgreSQL and SQLite schema definitions
- Produces: Normalized `payments` ledger table with `amount_paise`, `razorpay_order_id`, `razorpay_payment_id`, and `payment_events` audit trail table with `event_id` unique constraint.

- [ ] **Step 1: Update `supabase/schema.sql` with complete PostgreSQL DDL schema**

Update `supabase/schema.sql` to contain full tables for all 38 models, including `payments` and `payment_events`.

- [ ] **Step 2: Update SQLite DDL schema in `crm/src/lib/db.ts`**

Update `SCHEMA` in `crm/src/lib/db.ts` to include `amount_paise BIGINT NOT NULL DEFAULT 0`, `razorpay_order_id TEXT UNIQUE`, `razorpay_payment_id TEXT UNIQUE`, `razorpay_signature TEXT`, and create `payment_events` table in SQLite.

- [ ] **Step 3: Commit Task 1**

```bash
git add supabase/schema.sql crm/src/lib/db.ts
git commit -m "feat(schema): add Supabase PostgreSQL schema and extended SQLite payments ledger with event audit trail"
```

---

### Task 2: Supabase Sync Utility & Minor Unit Conversion Helpers

**Files:**
- Create: `crm/src/lib/supabase-sync.ts`
- Modify: `crm/src/lib/razorpay.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- Produces: `syncPaymentToSupabase(paymentId: number): Promise<void>`, `recordPaymentEventInSupabase(eventData: Record<string, any>): Promise<{ duplicate: boolean }>`

- [ ] **Step 1: Create `crm/src/lib/supabase-sync.ts`**

Implement helper functions to convert rupees to paise integer units (`toPaise`, `toRupees`), sync payment transactions to Supabase via `@supabase/supabase-js`, and record `payment_events` with idempotency checks.

- [ ] **Step 2: Commit Task 2**

```bash
git add crm/src/lib/supabase-sync.ts crm/src/lib/razorpay.ts
git commit -m "feat(supabase): add Supabase payment sync utility and integer minor unit helpers"
```

---

### Task 3: Integrate Webhook Event Audit Logging & Supabase Synchronization

**Files:**
- Modify: `crm/src/app/api/webhooks/razorpay/route.ts`
- Modify: `crm/src/lib/payment-actions.ts`

**Interfaces:**
- Consumes: `recordPaymentEventInSupabase`, `syncPaymentToSupabase`
- Produces: Audit logging of every webhook event and automated synchronization to Supabase DB.

- [ ] **Step 1: Update Webhook route in `crm/src/app/api/webhooks/razorpay/route.ts`**

Record Razorpay `event_id` and payload in `payment_events` table before processing. If `event_id` already exists, short-circuit gracefully returning 200 OK.

- [ ] **Step 2: Update `verifyBookingPayment` in `crm/src/lib/payment-actions.ts`**

Store `amount_paise` (integer minor units), `razorpay_order_id`, `razorpay_payment_id`, and invoke `syncPaymentToSupabase(payment.id)`.

- [ ] **Step 3: Commit Task 3**

```bash
git add crm/src/app/api/webhooks/razorpay/route.ts crm/src/lib/payment-actions.ts
git commit -m "feat(razorpay): integrate webhook event audit logging and Supabase payment ledger synchronization"
```

---

### Task 4: Testing & Verification

- [ ] **Step 1: Update `crm/scripts/test-razorpay.ts` to verify `amount_paise`, `payment_events`, and Supabase sync**
- [ ] **Step 2: Run test suite and typechecks**
