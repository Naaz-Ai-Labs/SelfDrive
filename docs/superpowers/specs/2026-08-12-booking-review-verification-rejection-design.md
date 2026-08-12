# Design Spec: CRM Booking Review, ID Proof Verification, Rejection Workflow & Fleet Units

**Date:** 2026-08-12  
**Status:** Approved by user  
**Target:** CRM & Web applications (`crm/` & `web/`)

---

## 1. Overview & Objective
When a customer makes a payment or submits a booking, staff and admin must be able to:
1. Click on any booking in the CRM to review all booking and customer details alongside inspectable, zoomable customer ID proofs (Driving Licence & Aadhaar card).
2. Manually verify each document or reject the booking with a structured rejection reason and custom message.
3. Keep rejected bookings segregated in a dedicated "Rejected Bookings" section/tab for cleaner operational workflows.
4. Correct the fleet capacity to **33 total units** with **Mahindra Thar having 2 units**, and update the Dashboard Vehicle KPI card to reflect total fleet units and units available (rather than model count).
5. Provide a realistic sample paid booking with uploaded ID proofs for immediate staff verification testing.

---

## 2. Architecture & Detailed Components

### A. Quick Review Slide-Over Drawer & Detail Views
- **Component**: `BookingReviewDrawer.tsx` / `DocumentVerifier.tsx`
- **Location**: Used in `/dashboard/bookings` and `/dashboard` (Pending Approvals Inbox)
- **Features**:
  - Customer info: Name, Phone (with direct WhatsApp click-to-chat `wa.me`), Email, Address.
  - Rental info: Booking Number, Status Badge, Pickup & Return dates/times, Duration.
  - Vehicle details: Name, Category, Registration No, Image.
  - Payment details: Base rental, GST, Security deposit, Total amount, Amount paid, Balance due.
  - **ID Proof Inspector**:
    - Driving Licence & Aadhaar Card / Passport images displayed as high-res thumbnails.
    - Full-screen Lightbox modal with zoom (+ / - / reset) and rotation for verifying document text.
    - Individual "Approve ✓" / "Unverify" toggles per document.
  - Action footer:
    - "Approve Booking ✓" (marks status as Confirmed).
    - "Reject Booking ❌" (opens rejection reason modal).
    - "Open Full Detail Page ↗".

### B. Rejection Workflow with Reason Logging
- **Component & Action**: `rejectBooking({ bookingId, reason, notes })` in `crm/src/lib/actions.ts`
- **Rejection Dialog**:
  - Preset options:
    - *Driving Licence unreadable or expired*
    - *Aadhaar / ID proof invalid or blurred*
    - *Customer name does not match ID proof*
    - *Under minimum age requirement (18+ / 21+)*
    - *Vehicle unavailable for requested time slot*
    - *Customer unreachable / unverified identity*
    - *Other (Custom reason)*
  - Notes field for specific instructions/explanation.
- **Database & State Changes**:
  - Updates `bookings.status = 'Rejected'` and records `bookings.notes`.
  - Appends record in `booking_history` with action `'rejected'`, staff ID, timestamp, and details JSON.
  - Releases vehicle allocation (increasing available units).
  - Syncs status change to Supabase.
  - Shows 60-second fallback "Undo" notification in CRM.

### C. Dedicated "Rejected Bookings" CRM Section
- In `crm/src/app/dashboard/(main)/bookings/page.tsx` & client list component:
  - Tab 1: **All Bookings** (with total count)
  - Tab 2: **Active & Upcoming** (Confirmed, Active rental, Handed over)
  - Tab 3: **Pending Verification** (Pending verification, Payment received, Draft)
  - Tab 4: **Rejected Bookings ❌** (Dedicated tab with red badge, displaying Booking #, Customer, Vehicle, Rejection Reason, Staff who rejected, Rejection timestamp, and "View / Reopen" action).

### D. Fleet Units & Dashboard KPI Correction (33 Total Units)
- **Vehicle Unit Updates**:
  - Update vehicle units in SQLite database schema / seed migrations and Supabase:
    - TVS Jupiter: 4 units
    - Honda Dio: 4 units
    - Honda Activa: 3 units
    - TVS NTorq: 3 units
    - Yamaha RayZR: 2 units
    - TVS Ronin: 2 units
    - Honda CB200X: 2 units
    - TVS Raider: 2 units
    - Honda Shine: 2 units
    - Bajaj Pulsar NS: 1 unit
    - Maruti Baleno: 2 units
    - Mahindra Thar 4x4: **2 units** (updated from 1)
    - Maruti Dzire: 1 unit
    - Maruti Ciaz: 1 unit
    - Maruti Ertiga: 1 unit
    - Tempo Traveller (12-seater): 1 unit
    - **Total Fleet Inventory: 33 Units**
- **Dashboard KPI Metric**:
  - Primary Metric: `33 Total Units` (Calculated via `SUM(total_units)` from `vehicles WHERE active = 1`).
  - Subtitle: `X units available` (Calculated via total units minus active rentals / maintenance).

### E. Sample Paid Booking with Uploaded Documents
- Insert into database:
  - Customer: Rajesh Sharma (`+91 98451 23456`, `rajesh.sharma@example.com`)
  - Vehicle: Mahindra Thar 4x4 (KA-46-C-9999)
  - Booking No: `BK-TEST-PAID-01`
  - Dates: Tomorrow 09:00 AM to Next Day 09:00 AM
  - Amounts: ₹5,000 base + ₹300 GST + ₹2,000 deposit = ₹7,300 total (Paid: ₹7,300)
  - Status: `"Pending verification"` (with status badge "Payment Received")
  - Documents:
    - Driving Licence (DL-0420110012345, verified: 0)
    - Aadhaar Card (XXXX-XXXX-9876, verified: 0)
  - Payments: Paid via Online Razorpay `pay_SAMPLE_PAID_987`

---

## 3. Verification Plan
1. **Dashboard Check**: Verify Vehicles KPI card shows 33 Total Units and correct available units hint.
2. **Bookings List Check**: Verify tabs (All, Active, Pending, Rejected) and quick review drawer.
3. **Sample Booking Review**: Click on `BK-TEST-PAID-01`, inspect Driving Licence & Aadhaar photos in zoom lightbox.
4. **Approve / Reject Action**: Test approving documents and rejecting with a selected reason.
5. **Rejected Section**: Confirm rejected booking moves into the "Rejected Bookings" tab with rejection reason clearly displayed.
