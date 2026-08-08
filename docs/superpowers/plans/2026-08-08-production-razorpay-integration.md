# Production Razorpay Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Razorpay booking payment flow into a robust, production-grade integration featuring server-side webhook processing (`payment.captured`, `payment.failed`, `refund.processed`), HMAC signature security, and automated Razorpay refund execution.

**Architecture:** Monorepo (`crm` and `web`). Gateway endpoints on `crm` under `/api/gateway/v1/*` handle database persistence and REST calls to Razorpay (`https://api.razorpay.com/v1/*`). Webhooks post to `crm` (`/api/webhooks/razorpay`), validating `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` before updating SQLite (`crm/data/darshan.db`) database asynchronously.

**Tech Stack:** Next.js (App Router), TypeScript, Node.js Native SQLite (`DatabaseSync`), Crypto (`node:crypto`), Razorpay REST API.

## Global Constraints

- **Repository**: Monorepo with NPM Workspaces (`web` on port 3000, `crm` on port 3001).
- **Database**: SQLite (`crm/data/darshan.db`) controlled solely by `crm`. `web` communicates via gateway API with `GATEWAY_API_KEY`.
- **HMAC Verification**: Use `crypto.timingSafeEqual` with `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
- **No Direct DB from Web**: All database operations must be executed inside `crm`.

---

### Task 1: Razorpay REST Client & Webhook Verification Helper Expansion

**Files:**
- Modify: `crm/src/lib/razorpay.ts`
- Modify: `crm/.env.example`

**Interfaces:**
- Consumes: `process.env.RAZORPAY_KEY_ID`, `process.env.RAZORPAY_KEY_SECRET`, `process.env.RAZORPAY_WEBHOOK_SECRET`
- Produces: `verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean`, `issueRazorpayRefund(paymentId: string, amountInRupees: number, notes?: Record<string, string>): Promise<{ ok: boolean; refundId?: string; error?: string }>`

- [ ] **Step 1: Write helper functions for webhook verification & refunds in `crm/src/lib/razorpay.ts`**

```typescript
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function issueRazorpayRefund(input: {
  razorpayPaymentId: string;
  amountInRupees: number;
  notes?: Record<string, string>;
}): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return { ok: false, error: "Razorpay API credentials not configured." };
  }

  const amountPaise = Math.round(input.amountInRupees * 100);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${input.razorpayPaymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: amountPaise, notes: input.notes ?? {} }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.description ?? "Refund processing failed." };
    }
    return { ok: true, refundId: data.id };
  } catch {
    return { ok: false, error: "Could not reach Razorpay API for refund." };
  }
}
```

- [ ] **Step 2: Add `RAZORPAY_WEBHOOK_SECRET` to `.env.example` in `crm`**

```env
RAZORPAY_WEBHOOK_SECRET=
```

- [ ] **Step 3: Commit Task 1**

```bash
git add crm/src/lib/razorpay.ts crm/.env.example
git commit -m "feat(razorpay): add webhook signature verification and automated refund API client"
```

---

### Task 2: Razorpay Webhook API Route Handler

**Files:**
- Create: `crm/src/app/api/webhooks/razorpay/route.ts`
- Modify: `crm/src/lib/payment-actions.ts`

**Interfaces:**
- Consumes: `verifyRazorpayWebhookSignature` from `@/lib/razorpay`, `verifyBookingPayment` from `@/lib/payment-actions`
- Produces: `POST /api/webhooks/razorpay` endpoint for Razorpay server webhooks

- [ ] **Step 1: Create webhook route in `crm/src/app/api/webhooks/razorpay/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { verifyBookingPayment } from "@/lib/payment-actions";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const valid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventType = event.event;
  const payload = event.payload;

  if (eventType === "payment.captured" || eventType === "order.paid") {
    const entity = payload?.payment?.entity ?? payload?.order?.entity;
    const orderId = entity?.order_id ?? entity?.id;
    const paymentId = entity?.id ?? entity?.payment_id;

    if (orderId && paymentId) {
      const db = getDb();
      const paymentRow = db.prepare("SELECT id FROM payments WHERE gateway_ref = ?").get(orderId) as { id: number } | undefined;
      if (paymentRow) {
        await verifyBookingPayment({
          paymentId: paymentRow.id,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature, // Or bypass signature check for webhook if order matches
        });
      }
    }
  } else if (eventType === "payment.failed") {
    const paymentEntity = payload?.payment?.entity;
    if (paymentEntity?.order_id) {
      const db = getDb();
      db.prepare("UPDATE payments SET status = 'Failed' WHERE gateway_ref = ? AND status = 'Pending'").run(paymentEntity.order_id);
      logActivity(null, "payment_failed_webhook", "payment", null, { orderId: paymentEntity.order_id, reason: paymentEntity.error_description });
    }
  }

  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 2: Commit Task 2**

```bash
git add crm/src/app/api/webhooks/razorpay/route.ts
git commit -m "feat(razorpay): add webhook API endpoint for async payment notifications"
```

---

### Task 3: Razorpay Automatic Refund Trigger in Staff CRM

**Files:**
- Modify: `crm/src/lib/portal-actions.ts` or `crm/src/lib/payment-actions.ts`

**Interfaces:**
- Consumes: `issueRazorpayRefund` from `@/lib/razorpay`
- Produces: Automatic refund processing when cancellations or staff refund approvals occur.

- [ ] **Step 1: Connect `issueRazorpayRefund` call when refunds are processed**

In `crm/src/lib/payment-actions.ts` or refund processing logic, call `issueRazorpayRefund` for paid Razorpay payments and update refund status to `Completed` with `transaction_ref = refundId`.

- [ ] **Step 2: Commit Task 3**

```bash
git add crm/src/lib/payment-actions.ts crm/src/lib/portal-actions.ts
git commit -m "feat(razorpay): integrate automated online refunds with Razorpay API"
```

---

### Task 4: Verification and End-to-End Testing

- [ ] **Step 1: Run TypeScript typecheck across workspaces**
`npm run typecheck --prefix crm` and `npm run typecheck --prefix web`

- [ ] **Step 2: Verify webhook signature logic with sample HMAC test**

- [ ] **Step 3: Final Commit and Verification Report**
