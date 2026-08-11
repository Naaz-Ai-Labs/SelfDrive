# Inline Payment Invoice & PDF Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an itemized tax invoice card directly on the web booking confirmation screen upon successful payment, complete with a 1-click **Download / Save as PDF** button.

**Architecture:** Create an `InlineInvoiceCard` component that renders invoice headers, customer info, itemized rate table, GST, deposit, and status badge. Wire it into Step 6 of `BookingForm.tsx` when payment is verified, with `@media print` CSS rules so the PDF download button triggers a clean, professional print-to-PDF output.

**Tech Stack:** Next.js (React), Tailwind CSS, Vanilla CSS print styles, window.print().

## Global Constraints

- Use Vanilla CSS and Tailwind classes consistent with the design system.
- Preserve existing invoice data schemas and URLs (`/invoice/[bookingNo]`).
- Clean print styles hiding non-invoice controls during PDF generation.

---

### Task 1: Create `InlineInvoiceCard` Component

**Files:**
- Create: `web/src/components/booking/InlineInvoiceCard.tsx`
- Modify: `web/src/components/customer/InvoicePrintButton.tsx`

**Interfaces:**
- Consumes: `{ bookingNo: string; bookingId?: number; customerName?: string; customerPhone?: string; customerEmail?: string; quote?: Quote | null; amountPaid: number; paymentId?: string; paymentDate?: string }`
- Produces: React component `InlineInvoiceCard`

- [ ] **Step 1: Create `InlineInvoiceCard.tsx` with print styles and PDF download button**

```tsx
"use client";

import Link from "next/link";
import { formatINR } from "@/lib/utils";
import type { Quote } from "@/lib/booking-actions";

type Props = {
  bookingNo: string;
  bookingId?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  quote?: Quote | null;
  amountPaid: number;
  paymentId?: string;
  paymentDate?: string;
};

export function InlineInvoiceCard({
  bookingNo,
  bookingId,
  customerName,
  customerPhone,
  customerEmail,
  quote,
  amountPaid,
  paymentId,
  paymentDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
}: Props) {
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(bookingId || bookingNo.replace(/\D/g, "") || "10001").slice(-5)}`;
  const baseAmount = quote ? quote.baseAmount : Math.max(0, amountPaid - (quote?.depositAmount || 1000) - (quote?.gstAmount || 60));
  const depositAmount = quote ? quote.depositAmount : 1000;
  const gstAmount = quote ? quote.gstAmount : Math.round(baseAmount * 0.06);

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-6 shadow-md transition print:border-none print:shadow-none print:p-0">
      {/* Invoice Header */}
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 print:hidden">PAID TAX INVOICE</span>
            <span className="text-xs text-ink-400">#{invoiceNo}</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-ink-950">Darshh Holiday Bike & Car Rentals</h2>
          <p className="text-xs text-ink-500">Main Branch: Hassan & Sakleshpura, Karnataka · +91 98452 10001</p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold uppercase text-ink-400">Date Paid</p>
          <p className="text-sm font-semibold text-ink-900">{paymentDate}</p>
          <p className="text-xs text-ink-500">Booking: <span className="font-mono font-bold text-ink-900">{bookingNo}</span></p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-1 gap-4 py-4 text-xs sm:grid-cols-2">
        <div>
          <p className="font-semibold uppercase text-ink-400">Billed To</p>
          <p className="font-semibold text-ink-900">{customerName || "Valued Customer"}</p>
          {customerPhone && <p className="text-ink-600">{customerPhone}</p>}
          {customerEmail && <p className="text-ink-600">{customerEmail}</p>}
        </div>
        <div className="sm:text-right">
          <p className="font-semibold uppercase text-ink-400">Payment Status</p>
          <p className="font-bold text-emerald-700">✓ Fully Paid via Razorpay UPI / Online</p>
          {paymentId && <p className="text-ink-500">Transaction ID: <span className="font-mono text-ink-800">{paymentId}</span></p>}
        </div>
      </div>

      {/* Itemized Table */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-ink-100 text-ink-400 uppercase">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50 text-ink-800">
            <tr>
              <td className="py-2.5">
                <span className="font-semibold text-ink-900">Vehicle Rental Charge</span>
                {quote && <span className="ml-1 text-ink-500">({quote.days} day{quote.days > 1 ? "s" : ""})</span>}
              </td>
              <td className="py-2.5 text-right font-medium text-ink-900">{formatINR(baseAmount)}</td>
            </tr>
            {quote && Boolean(quote.offSchedulePickupFee && quote.offSchedulePickupFee > 0) && (
              <tr>
                <td className="py-2.5 text-amber-800">Off-Schedule Pickup Surcharge</td>
                <td className="py-2.5 text-right font-medium text-amber-900">{formatINR(quote.offSchedulePickupFee)}</td>
              </tr>
            )}
            <tr>
              <td className="py-2.5">GST (6%)</td>
              <td className="py-2.5 text-right font-medium text-ink-900">{formatINR(gstAmount)}</td>
            </tr>
            <tr>
              <td className="py-2.5">
                <span>Refundable Security Deposit</span>
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 print:hidden">Refundable on return</span>
              </td>
              <td className="py-2.5 text-right font-medium text-ink-900">{formatINR(depositAmount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-900 font-bold text-sm text-ink-950">
              <td className="pt-3">Total Amount Paid</td>
              <td className="pt-3 text-right text-emerald-700">{formatINR(amountPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* PDF Download & Print Action Buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 print:hidden">
        <Link
          href={`/invoice/${encodeURIComponent(bookingNo)}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
        >
          <span>👁️ View Full Page Invoice</span>
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download / Save PDF Invoice
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add web/src/components/booking/InlineInvoiceCard.tsx
git commit -m "feat: create InlineInvoiceCard with print and PDF download support"
```

---

### Task 2: Integrate `InlineInvoiceCard` into `BookingForm.tsx`

**Files:**
- Modify: `web/src/components/booking/BookingForm.tsx:568-601`

**Interfaces:**
- Consumes: `InlineInvoiceCard` component
- Produces: Integrated booking success screen displaying tax invoice and PDF download option.

- [ ] **Step 1: Update `BookingForm.tsx` step 6 (paid === true)**

Import `InlineInvoiceCard` and render it right below the "You're all set!" success message when payment completes:

```tsx
import { InlineInvoiceCard } from "./InlineInvoiceCard";

// inside step 6 paid check:
<div className="mx-auto max-w-xl">
  {!paid ? (
    ...
  ) : (
    <div>
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 className="mt-4 font-display text-3xl font-semibold text-ink-900">You&apos;re all set!</h1>
        <p className="mt-2 text-sm text-ink-600">Your booking number is <strong>{result.bookingNo}</strong>. Here is your official payment tax invoice.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a href={waLink(businessWhatsapp, `Hi, this is regarding my booking ${result.bookingNo}`)} target="_blank" rel="noopener noreferrer" className="btn-primary py-2 text-xs">Message us on WhatsApp</a>
          <Link href="/customer/portal" className="btn-secondary py-2 text-xs">Track in Customer Portal</Link>
        </div>
      </div>

      {/* Render Inline Tax Invoice with PDF Download option */}
      <InlineInvoiceCard
        bookingNo={result.bookingNo}
        bookingId={result.bookingId}
        customerName={contact.name}
        customerPhone={contact.phone}
        customerEmail={contact.email}
        quote={activeQuote}
        amountPaid={activeQuote?.totalAmount ?? 2219}
      />
    </div>
  )}
</div>
```

- [ ] **Step 2: Typecheck web package**

Run: `npx tsc --noEmit` in `web` directory.
Expected: PASS

- [ ] **Step 3: Commit Task 2**

```bash
git add web/src/components/booking/BookingForm.tsx
git commit -m "feat: render inline invoice and PDF download button on booking completion"
```

---

### Task 3: Verification & Walkthrough Update

- [ ] **Step 1: Test invoice display and print button styling**
- [ ] **Step 2: Update walkthrough artifact with implementation summary**
