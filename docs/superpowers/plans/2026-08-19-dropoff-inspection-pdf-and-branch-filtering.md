# Vehicle Drop-off Inspection Report & Branch-Wise Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authoritative 2-phase Vehicle Return / Drop-Off Verification & Final Settlement PDF report (with both Handover and Return 6-slot photos, initial & final odometer/fuel checks, payment/deposit ledger, and dual signature records), update handover PDF terminology, and implement functional branch-wise filtering across CRM Bookings and Fleet views.

**Architecture:** Extend PDF generation in `inspection-pdf.ts` with multi-page/multi-section support for return audits, integrate `/api/bookings/[id]/inspection-report?type=return`, add signed return document uploader workflow, and enrich `BookingsTableWithTabs` with dynamic branch filtering.

**Tech Stack:** Next.js, PDFKit, React 19, TypeScript, Supabase PostgreSQL.

---

### Task 1: Update Handover Terminology & Implement Return / Drop-Off Inspection PDF Generation

**Files:**
- Modify: `crm/src/lib/inspection-pdf.ts`
- Modify: `crm/src/app/api/bookings/[id]/inspection-report/route.ts`
- Test: `crm/tests/comprehensive-hardening.test.ts`

- [ ] **Step 1: Update Handover PDF text**
  Change all occurrences of "PICKUP INSPECTION" to "HANDOVER INSPECTION" in `generateInspectionPdf(bookingRef, "handover")`.

- [ ] **Step 2: Implement `generateReturnInspectionPdf` in `inspection-pdf.ts`**
  Build 2-phase report containing:
  - Header: "VEHICLE RETURN & DROP-OFF INSPECTION REPORT"
  - Customer & Rental Schedule (Scheduled Pickup, Actual Pickup, Scheduled Return, Actual Return, Duration)
  - Vehicle & Unit Details (Model, Plate No, Start Odo, End Odo, Total Km Driven, Extra Km)
  - Financial & Settlement Audit Ledger (Rental Fee, Advance Paid, Balance Collected, Extra Km Fee, Late Fee, Damage Charge, Security Deposit Refund Status)
  - Phase 1: 6-Slot Handover / Pickup Photographs (Front, Rear, Left, Right, Initial Odo, Initial Fuel)
  - Phase 2: 6-Slot Drop-Off / Return Photographs (Front, Rear, Left, Right, Final Odo, Final Fuel)
  - Return Confirmation Declaration Text
  - Terms & Conditions
  - Dual Signatures: Previous Handover Sign-off Record + Drop-Off Return Signature Block for Customer & Staff Officer.

- [ ] **Step 3: Update `inspection-report/route.ts`**
  Accept `?type=return` or `?type=handover` query param and return appropriate PDF stream.

---

### Task 2: Update CRM Booking Details Page & Signed Return Document Workflow

**Files:**
- Modify: `crm/src/app/dashboard/(main)/bookings/[id]/page.tsx`
- Modify: `crm/src/components/dashboard/SignedDocumentUploader.tsx`

- [ ] **Step 1: Add Drop-off Report PDF button to Booking Detail Header**
  Show `Handover Inspection Report (PDF)` when handover inspection exists, and `Return Inspection Report (PDF)` when return inspection exists.

- [ ] **Step 2: Update SignedDocumentUploader**
  Allow staff to select whether they are uploading a `Signed Handover Agreement` or `Signed Return Settlement Agreement` (`SIGNED-HANDOVER` vs `SIGNED-RETURN`).

---

### Task 3: Implement Branch-Wise Filtering across CRM Bookings Table & Fleet

**Files:**
- Modify: `crm/src/components/dashboard/BookingsTableWithTabs.tsx`
- Modify: `crm/src/app/dashboard/(main)/bookings/page.tsx`
- Modify: `crm/src/app/dashboard/(main)/vehicles/page.tsx`
- Test: `crm/tests/comprehensive-hardening.test.ts`

- [ ] **Step 1: Pass branches list to `BookingsTableWithTabs`**
  In `bookings/page.tsx`, fetch `getBranches(true)` and pass to `BookingsTableWithTabs`.

- [ ] **Step 2: Add Branch Filter selector in `BookingsTableWithTabs`**
  Add interactive Branch dropdown (`All Branches`, `Sakleshpur Branch`, `Hassan Branch`, etc.) and filter bookings accordingly. Display branch badge in table.

- [ ] **Step 3: Verify and test branch filtering logic**
  Ensure branch filtering correctly segments bookings and fleet units.

---

### Task 4: Verification & Automated Tests

**Files:**
- Test: `crm/tests/comprehensive-hardening.test.ts`

- [ ] **Step 1: Run full unit test suite**
  `npm test` in `crm/`
- [ ] **Step 2: Run typechecks**
  `npm run typecheck` in `crm/` and `web/`
