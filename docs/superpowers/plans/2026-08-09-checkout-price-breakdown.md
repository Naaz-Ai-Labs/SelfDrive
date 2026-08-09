# Checkout Price Breakdown & DB Transaction Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible itemized price breakdown accordion to Step 6 of the booking checkout wizard and store all payment transactions with itemized breakdown JSON in both SQLite and Supabase PostgreSQL databases.

**Architecture:** Update `RazorpayCheckout.tsx` with a toggleable itemized price breakdown accordion component. Update `payment-actions.ts` to log transaction details with `breakdown_json` in local SQLite and live Supabase PostgreSQL databases.

**Tech Stack:** Next.js, React (TypeScript), Tailwind CSS, Razorpay SDK, SQLite (`node:sqlite`), Supabase (`@supabase/supabase-js`).

## Global Constraints

- Preserve all existing API signatures and payment verification logic.
- Ensure strict dual-DB transaction logging (SQLite `darshan.db` & Supabase PostgreSQL `payments`).

---

### Task 1: Add Collapsible Price Breakdown Accordion to RazorpayCheckout Component

**Files:**
- Modify: `web/src/components/booking/RazorpayCheckout.tsx`
- Modify: `web/src/components/booking/BookingForm.tsx`

- [ ] **Step 1: Update RazorpayCheckout props to accept quote estimate object**

```tsx
export function RazorpayCheckout({
  bookingId,
  amountDue,
  customerName,
  customerPhone,
  customerEmail,
  quote,
  onPaid,
  onPayLater,
}: {
  bookingId: number;
  amountDue: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quote?: {
    days: number;
    baseAmount: number;
    gstPct: number;
    gstAmount: number;
    depositAmount: number;
    gatewayFeeAmount: number;
    totalAmount: number;
    vehicleName?: string;
  } | null;
  onPaid: () => void;
  onPayLater: () => void;
})
```

- [ ] **Step 2: Add collapsible state `showBreakdown` to `RazorpayCheckout`**

```tsx
const [showBreakdown, setShowBreakdown] = useState(true);
```

- [ ] **Step 3: Render itemized price breakdown table inside collapsible panel**

```tsx
<div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-ink-700">
  <div className="flex items-center justify-between">
    <p className="font-bold text-ink-900">Total payable now: {formatINR(amountDue)}</p>
    <button
      type="button"
      onClick={() => setShowBreakdown((prev) => !prev)}
      className="text-xs font-semibold text-brand-800 hover:underline flex items-center gap-1"
    >
      {showBreakdown ? "Hide details ▲" : "View complete price breakdown ▼"}
    </button>
  </div>
  {showBreakdown && quote && (
    <div className="mt-3 space-y-1.5 border-t border-brand-200/80 pt-3 text-xs text-ink-800">
      <div className="flex justify-between">
        <span>Base Vehicle Rental ({quote.days} day{quote.days > 1 ? "s" : ""})</span>
        <span className="font-semibold">{formatINR(quote.baseAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span>Mandatory Pickup Handover Charge</span>
        <span className="font-semibold">₹250</span>
      </div>
      <div className="flex justify-between">
        <span>GST ({quote.gstPct}%)</span>
        <span className="font-semibold">{formatINR(quote.gstAmount)}</span>
      </div>
      <div className="flex justify-between text-emerald-800">
        <span>Refundable Security Deposit</span>
        <span className="font-semibold">{formatINR(quote.depositAmount)}</span>
      </div>
      <div className="flex justify-between border-t border-brand-300 pt-2 text-sm font-bold text-ink-950">
        <span>Total Payable</span>
        <span>{formatINR(quote.totalAmount)}</span>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Pass `quote` prop from `BookingForm.tsx` to `RazorpayCheckout`**

- [ ] **Step 5: Verify build with `npm run build` in `web/`**

- [ ] **Step 6: Commit**

```bash
git add web/src/components/booking/RazorpayCheckout.tsx web/src/components/booking/BookingForm.tsx
git commit -m "feat(checkout): add collapsible price breakdown accordion to RazorpayCheckout component"
```

---

### Task 2: Log Payment Orders & Transactions with Breakdown JSON in SQLite & Supabase

**Files:**
- Modify: `crm/src/lib/payment-actions.ts`
- Test: `crm/scripts/test-razorpay.ts`

- [ ] **Step 1: Store itemized `breakdown_json` during `createBookingPaymentOrder`**

```typescript
const breakdownJson = JSON.stringify({
  baseAmount: quote.baseAmount,
  pickupFee: 250,
  gstAmount: quote.gstAmount,
  depositAmount: quote.depositAmount,
  totalAmount: quote.totalAmount,
});
```

- [ ] **Step 2: Dual DB write (SQLite + Supabase) on order creation and verification**

- [ ] **Step 3: Run `npx tsx scripts/test-razorpay.ts` to verify full suite passes**

- [ ] **Step 4: Commit**

```bash
git add crm/src/lib/payment-actions.ts crm/scripts/test-razorpay.ts
git commit -m "feat(payments): store itemized breakdown JSON and transaction logs in SQLite and Supabase"
```
