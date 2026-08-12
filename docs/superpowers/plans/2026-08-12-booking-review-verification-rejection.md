# CRM Booking Review, ID Proof Verification, Rejection Workflow & Fleet Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full booking & uploaded ID proof review in CRM, manual verification and structured rejection with reasons, dedicated rejected bookings view, fix fleet units to 33 total (with Thar at 2 units), and seed a sample paid booking.

**Architecture:** 
- Schema & Data layer: Update SQLite migrations and Supabase sync to maintain 33 total units (Thar = 2 units), add `"Rejected"` status, and seed a complete paid sample booking with DL & Aadhaar ID documents.
- Action layer: Implement `rejectBooking({ bookingId, reason, notes })` with audit logging in `booking_history` and PostgreSQL sync.
- UI layer: Build `BookingReviewModal` (interactive slide-over drawer with zoomable document viewer & rejection dialog), update `BookingsTableWithTabs` in `/dashboard/bookings` with a dedicated "Rejected Bookings" tab, and update `/dashboard` KPI cards to compute `SUM(total_units)`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, SQLite (`node:sqlite` / `better-sqlite3`), Supabase PostgreSQL.

## Global Constraints
- Do not break existing booking APIs or customer portal routes.
- Fleet total units must equal exactly 33 across all active vehicles.
- Mahindra Thar (id: 16) must have `total_units = 2`.
- Statuses in `crm/src/lib/settings.ts` must include `"Rejected"`.

---

### Task 1: Database & Fleet Units Migration (33 Total Units & Sample Booking)

**Files:**
- Modify: `crm/src/lib/db.ts:745-785`
- Modify: `crm/src/lib/seed.ts:90-180`
- Modify: `crm/src/lib/settings.ts:52-68`
- Modify: `web/src/lib/data.ts:44-70`

**Interfaces:**
- Consumes: DatabaseSync connection from `crm/src/lib/db.ts`
- Produces: 33 total fleet units, Thar with 2 units, seeded sample booking `BK-TEST-PAID-01` with DL & Aadhaar in `customer_documents`, `"Rejected"` in `booking_statuses`.

- [ ] **Step 1: Update vehicle total_units migration in db.ts and web/src/lib/data.ts**
  - Set Thar (id: 16) to 2 units.
  - Ensure sum of `total_units` across active vehicles = 33:
    - Dio: 4, Activa: 3, Jupiter: 4, RayZR: 2, NTorq: 3 (16 Scooters)
    - Ronin: 2, CB200X: 2, Raider: 2, Pulsar NS: 1, Shine: 2 (9 Bikes)
    - Baleno: 2, Thar: 2, Dzire: 1, Ciaz: 1, Ertiga: 1 (7 Cars)
    - Tempo Traveller 12: 1 (1 Van)
    - Total = 33 units.

- [ ] **Step 2: Add seed for sample paid booking with uploaded ID proofs**
  - Customer: Rajesh Sharma (`rajesh.sharma@example.com`, `+91 98451 23456`)
  - Booking: `BK-TEST-PAID-01`, Vehicle: Thar (id: 16), Status: `Payment received`, Base: ₹5,000, Deposit: ₹2,000, GST: ₹300, Total & Paid: ₹7,300.
  - Payment: `PY-TEST-PAID-01`, Status: `Paid`, Razorpay payment ID: `pay_sample_paid_001`.
  - Documents:
    - Driving Licence: `/documents/sample-dl.webp` or placeholder image, number: `DL-0420110012345`, expiry: `2032-12-31`, verified: 0.
    - Aadhaar Card: `/documents/sample-aadhaar.webp` or placeholder image, number: `XXXX-XXXX-9876`, verified: 0.

- [ ] **Step 3: Add "Rejected" to booking_statuses in settings.ts**
  - Add `"Rejected"` to `booking_statuses` array.

- [ ] **Step 4: Commit**
  ```bash
  git add crm/src/lib/db.ts crm/src/lib/seed.ts crm/src/lib/settings.ts web/src/lib/data.ts
  git commit -m "feat: configure 33 fleet units, Thar 2 units, and sample paid booking"
  ```

---

### Task 2: Backend Rejection Action & Verification API

**Files:**
- Modify: `crm/src/lib/actions.ts:860-930`

**Interfaces:**
- Consumes: `staffUser()` from `crm/src/lib/auth.ts`, `getDb()` from `crm/src/lib/db.ts`
- Produces: `rejectBooking({ bookingId: number, reason: string, notes?: string })` Server Action

- [ ] **Step 1: Implement rejectBooking in actions.ts**
  ```ts
  export async function rejectBooking(input: { bookingId: number; reason: string; notes?: string }) {
    const staff = await staffUser();
    const db = getDb();
    const { supabaseAdmin } = await import("./supabase");

    const fullReason = input.notes ? `${input.reason}: ${input.notes}` : input.reason;
    db.prepare("UPDATE bookings SET status = 'Rejected', notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(fullReason, input.bookingId);

    db.prepare(
      "INSERT INTO booking_history (booking_id, user_id, action, detail) VALUES (?, ?, 'rejected', ?)"
    ).run(
      input.bookingId,
      staff.id,
      JSON.stringify({ staff_name: staff.name, reason: input.reason, notes: input.notes ?? null, new_status: "Rejected" })
    );

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("bookings").update({ status: "Rejected", notes: fullReason }).eq("id", input.bookingId);
      } catch {}
    }

    logActivity(staff.id, "booking_rejected", "booking", input.bookingId);
    refresh();
    return { ok: true };
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add crm/src/lib/actions.ts
  git commit -m "feat: add rejectBooking action with reason logging and sync"
  ```

---

### Task 3: Interactive Booking Review Modal & Document Inspector

**Files:**
- Create: `crm/src/components/dashboard/BookingReviewModal.tsx`
- Modify: `crm/src/components/dashboard/DocumentVerifier.tsx`

**Interfaces:**
- Consumes: Booking data, Customer documents, `rejectBooking`, `quickApproveBooking`, `verifyCustomerDocument`
- Produces: Slide-over drawer and Zoomable Lightbox with full details and rejection dialog

- [ ] **Step 1: Create BookingReviewModal component**
  - Shows customer header with phone (WhatsApp action `https://wa.me/...`), email, booking ID.
  - Financial breakdown (Rent, GST, Deposit, Paid, Balance).
  - Documents grid with image inspection (Zoom +, Zoom -, Reset, Full View).
  - Document verification toggle per document.
  - Approve Booking button.
  - Reject Booking button opening interactive Rejection Dialog with dropdown presets + custom notes.

- [ ] **Step 2: Enhance DocumentVerifier with full zoom & rejection presets**

- [ ] **Step 3: Commit**
  ```bash
  git add crm/src/components/dashboard/BookingReviewModal.tsx crm/src/components/dashboard/DocumentVerifier.tsx
  git commit -m "feat: create BookingReviewModal with zoomable document viewer and rejection dialog"
  ```

---

### Task 4: Dedicated "Rejected Bookings" Tab & Navigation

**Files:**
- Create: `crm/src/components/dashboard/BookingsTableWithTabs.tsx`
- Modify: `crm/src/app/dashboard/(main)/bookings/page.tsx`
- Modify: `crm/src/app/dashboard/(main)/bookings/[id]/page.tsx`

**Interfaces:**
- Consumes: Bookings rows with documents and history
- Produces: Tabbed Bookings view (All, Active, Pending, Rejected ❌) with instant review modal trigger

- [ ] **Step 1: Build BookingsTableWithTabs client component**
  - Tabs:
    - All Bookings (`count`)
    - Active & Confirmed (`count`)
    - Pending Verification (`count` with amber badge)
    - Rejected Bookings ❌ (`count` with red badge)
  - Rejected tab displays: Booking #, Customer, Vehicle, Rejection Reason, Staff who rejected, Rejection Date, and "Review / Reopen" action.
  - Clicking any booking row triggers the `BookingReviewModal`.

- [ ] **Step 2: Update BookingsPage to query documents and pass to BookingsTableWithTabs**

- [ ] **Step 3: Update Booking detail page (`/dashboard/bookings/[id]`)**
  - Add Rejection Reason banner at top if `status === 'Rejected'`.
  - Add Reject Booking button and Reopen button.

- [ ] **Step 4: Commit**
  ```bash
  git add crm/src/components/dashboard/BookingsTableWithTabs.tsx crm/src/app/dashboard/\(main\)/bookings/page.tsx crm/src/app/dashboard/\(main\)/bookings/\[id\]/page.tsx
  git commit -m "feat: add tabbed bookings table with dedicated rejected bookings section"
  ```

---

### Task 5: Dashboard Vehicle KPI Metric Update (33 Total Units & Available Units)

**Files:**
- Modify: `crm/src/app/dashboard/(main)/page.tsx`
- Modify: `crm/src/components/dashboard/PendingApprovalsInbox.tsx`

**Interfaces:**
- Consumes: SQLite database queries for vehicle units and bookings
- Produces: Accurate dashboard KPI card showing 33 Total Fleet Units and real-time available units

- [ ] **Step 1: Update KPI queries in DashboardPage**
  - Total Fleet Units: `SELECT COALESCE(SUM(total_units), 0) AS total_fleet_units FROM vehicles WHERE active = 1` -> 33
  - Booked Units: `SELECT COUNT(*) AS booked_units FROM bookings WHERE status IN ('Confirmed', 'Vehicle handed over', 'Active rental') AND datetime(return_at) >= datetime('now')`
  - Maintenance Units: `SELECT COALESCE(SUM(total_units), 0) AS maint_units FROM vehicles WHERE active = 1 AND status = 'maintenance'`
  - Available Units: `total_fleet_units - booked_units - maint_units`
  - Update Vehicles KPI card: Value: `33 Total Units` (or `${totalUnits} Units`), Hint: `${availableUnits} units available`.

- [ ] **Step 2: Integrate BookingReviewModal into PendingApprovalsInbox**
  - Clicking "View Details" opens the `BookingReviewModal` directly.

- [ ] **Step 3: Commit**
  ```bash
  git add crm/src/app/dashboard/\(main\)/page.tsx crm/src/components/dashboard/PendingApprovalsInbox.tsx
  git commit -m "feat: update dashboard KPI metrics for 33 total fleet units and integrate review modal"
  ```

---

### Task 6: Verification & End-to-End Testing

**Files:**
- Test with browser and database inspection.

- [ ] **Step 1: Check database total units = 33 and Thar = 2 units**
- [ ] **Step 2: Check sample booking `BK-TEST-PAID-01` displays with uploaded ID documents**
- [ ] **Step 3: Test clicking booking row to open review drawer and test document zoom controls**
- [ ] **Step 4: Test rejecting a booking with a selected reason and verifying it moves to the "Rejected Bookings" tab**
- [ ] **Step 5: Verify dashboard KPI cards display 33 total units accurately**
