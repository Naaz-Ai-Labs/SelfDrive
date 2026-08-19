# CRM Continuation & Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize and harden the Darshh Holiday CRM & Website platform by transitioning to a first-class physical unit inventory model, period-based dynamic branch allocation, unified authoritative availability engine, immediate deletion consistency, multi-layered idempotency & concurrency protection, dynamic multi-branch filtering, and professional print-ready vehicle inspection PDF reports.

**Architecture:** Single source of truth in Supabase PostgreSQL (`vehicle_units`, `branch_allocations`, `branch_transfers`, `idempotency_keys`, and atomic reservation RPCs), coordinated by a centralized TypeScript service layer, instant Redis/Next.js cache invalidation, and server-side PDFKit document rendering.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase PostgreSQL / PostgREST, Upstash Redis / Memory cache, PDFKit, Zod, TypeScript, Node.js Test Runner.

## Global Constraints
- Strictly limit process concurrency: ONE command at a time, sequential execution, reuse existing servers.
- Generic multi-branch architecture: support Sakleshpur, Hassan, and all future branches dynamically (no hardcoded branches).
- Zero data loss: backfill existing vehicle records safely into physical units with intact booking history.
- Unified authoritative availability: eliminate duplicate availability rules between CRM and Web.
- Concurrency & idempotency protection at both database and application levels.
- No regression in existing booking, customer, payment, or auth workflows.

---

### Task 1: Database Migration for Physical Units, Branch Allocations & Idempotency

**Files:**
- Create: `supabase/migrations/20260818_physical_units_and_allocations.sql`
- Test: `crm/tests/integration.test.ts`
- Test: `crm/tests/physical-units.test.ts`

**Interfaces:**
- Produces: Tables `vehicle_units`, `branch_allocations`, `branch_transfers`, `idempotency_keys`, foreign keys on `bookings` and `availability_blocks`, trigger `trg_prevent_overlapping_allocations`, and backfill for existing vehicles.

- [ ] **Step 1: Write SQL migration file**
Create `supabase/migrations/20260818_physical_units_and_allocations.sql` with schema definitions for `vehicle_units`, `branch_allocations`, `branch_transfers`, `idempotency_keys`, indexes, constraints, trigger preventing overlapping allocations, and backfill logic for existing vehicles.

- [ ] **Step 2: Apply migration to Supabase instance**
Apply the migration against the Supabase database using the Supabase client or SQL execution.

- [ ] **Step 3: Write unit/integration test for physical units & allocations**
Create `crm/tests/physical-units.test.ts` verifying `vehicle_units` creation, branch allocations, and non-overlapping constraints.

- [ ] **Step 4: Run test to verify schema**
Run: `npm run test:integration --prefix crm`
Expected: PASS

---

### Task 2: Authoritative Fleet Availability & Unit Reservation RPC

**Files:**
- Create: `supabase/migrations/20260818_authoritative_availability_rpc.sql`
- Modify: `crm/src/lib/bookings.ts`
- Modify: `crm/src/lib/data.ts`
- Modify: `web/src/lib/booking-actions.ts`
- Test: `crm/tests/unit-availability.test.ts`

**Interfaces:**
- Produces: RPC `reserve_vehicle_unit_slot(p_vehicle_id, p_branch_id, p_pickup_at, p_return_at, p_exclude_booking_id)` returning `{ block_id, unit_id, unit_identifier }`.

- [ ] **Step 1: Write SQL RPC migration**
Create `supabase/migrations/20260818_authoritative_availability_rpc.sql` with `reserve_vehicle_unit_slot` and `get_fleet_daily_allocations`.

- [ ] **Step 2: Apply RPC migration**
Apply the migration to Supabase.

- [ ] **Step 3: Update reservation callers in CRM and Web**
Update `crm/src/lib/bookings.ts` and `web/src/lib/booking-actions.ts` to use `reserve_vehicle_unit_slot`.

- [ ] **Step 4: Run unit-availability test**
Run: `tsx --test crm/tests/unit-availability.test.ts`
Expected: PASS with unit-level atomic reservation.

---

### Task 3: Idempotency Service Layer

**Files:**
- Create: `crm/src/lib/idempotency.ts`
- Create: `crm/tests/idempotency.test.ts`

**Interfaces:**
- Produces: `withIdempotency<T>(key: string, operation: string, payload: unknown, handler: () => Promise<T>): Promise<T>`

- [ ] **Step 1: Write failing unit test for idempotency**
Create `crm/tests/idempotency.test.ts` testing duplicate execution with same key (returns cached) and different payload (throws 409 Conflict).

- [ ] **Step 2: Run test to verify failure**
Run: `tsx --test crm/tests/idempotency.test.ts`

- [ ] **Step 3: Implement `withIdempotency`**
Implement SHA-256 hashing, database record management in `crm/src/lib/idempotency.ts`.

- [ ] **Step 4: Run test to verify pass**
Run: `tsx --test crm/tests/idempotency.test.ts`

---

### Task 4: Quantity-Based Vehicle Creation & Branch Segregation

**Files:**
- Modify: `crm/src/lib/actions.ts`
- Modify: `crm/src/components/dashboard/VehicleForm.tsx`
- Test: `crm/tests/vehicle-creation.test.ts`

**Interfaces:**
- Consumes: `vehicle_units`, `branch_allocations`
- Produces: `saveVehicle` with multi-quantity branch segregation support

- [ ] **Step 1: Write unit tests for vehicle creation & branch allocation validation**
Test sum(allocations) <= total_units, non-negative values, unallocated inventory calculation.

- [ ] **Step 2: Implement backend logic in `saveVehicle`**
Create physical units and initial allocations inside `saveVehicle`.

- [ ] **Step 3: Update `VehicleForm.tsx` UI**
Add branch segregation checkbox, dynamic branch allocation rows, and live validation.

- [ ] **Step 4: Verify in tests**
Run: `tsx --test crm/tests/vehicle-creation.test.ts`

---

### Task 5: Daily Branch Allocation View & Branch Transfer Management

**Files:**
- Create: `crm/src/app/dashboard/(main)/allocations/page.tsx`
- Create: `crm/src/components/dashboard/DailyAllocationMatrix.tsx`
- Create: `crm/src/components/dashboard/BranchTransferModal.tsx`
- Modify: `crm/src/components/dashboard/NavLinks.tsx`
- Modify: `crm/src/lib/data.ts`
- Modify: `crm/src/lib/actions.ts`

**Interfaces:**
- Produces: `getDailyBranchAllocations()`, `transferVehicleUnit()`, `/dashboard/allocations` route.

- [ ] **Step 1: Implement `getDailyBranchAllocations` in `crm/src/lib/data.ts`**
Compute daily fleet distribution matrix across dynamic branches.

- [ ] **Step 2: Implement `transferVehicleUnit` action in `crm/src/lib/actions.ts`**
Validate non-overlapping allocation and write transfer audit record.

- [ ] **Step 3: Build Daily Allocation Matrix UI & Transfer Modal**
Build matrix view with date-range filters, vehicle model dropdown, and unit transfer modal.

- [ ] **Step 4: Verify typecheck**
Run: `npm run typecheck --prefix crm`

---

### Task 6: Vehicle Deletion Consistency Fix & Instant Cache Busting

**Files:**
- Modify: `crm/src/lib/actions.ts`
- Modify: `crm/src/components/dashboard/VehicleForm.tsx`
- Modify: `crm/src/lib/data.ts`
- Modify: `web/src/lib/data.ts`
- Test: `crm/tests/deletion-consistency.test.ts`

**Interfaces:**
- Produces: Consistent soft/hard delete, instant cache purge, exclusion from availability and queries.

- [ ] **Step 1: Write integration test for deletion consistency**
Verify deleting vehicle removes it immediately from `getVehicles()`, prevents future bookings, and clears cache.

- [ ] **Step 2: Update `deleteVehicle` in `crm/src/lib/actions.ts`**
Ensure atomic soft-deletion (`active = 0, status = 'archived'`), deactivate physical units, release future blocks, flush cache prefix across keys, revalidate paths.

- [ ] **Step 3: Update `VehicleForm.tsx` and `web/src/lib/data.ts`**
Handle delete response properly with error alerts and ensure web content queries strictly respect active/archived state without resurrection.

- [ ] **Step 4: Run tests**
Run: `tsx --test crm/tests/deletion-consistency.test.ts`

---

### Task 7: Dynamic Branch Filtering & Unified Website Availability

**Files:**
- Modify: `web/src/lib/data.ts`
- Modify: `web/src/lib/booking-actions.ts`
- Modify: `crm/src/lib/data.ts`
- Modify: `crm/src/app/dashboard/(main)/vehicles/page.tsx`

**Interfaces:**
- Consumes: Authoritative branch allocations & availability

- [ ] **Step 1: Update `getVehicles` in `web/src/lib/data.ts` and `crm/src/lib/data.ts`**
Fetch vehicles with unit counts matched against active branch allocations.

- [ ] **Step 2: Update website booking bar & fleet grid**
Ensure branch dropdown dynamically pulls branches, and vehicle cards reflect real branch-allocated stock.

- [ ] **Step 3: Verify website & CRM builds**
Run: `npm run typecheck --prefix web` && `npm run typecheck --prefix crm`

---

### Task 8: Print-Ready Vehicle Inspection PDF Report

**Files:**
- Create: `crm/src/lib/inspection-pdf.ts`
- Create: `crm/src/app/api/bookings/[id]/inspection-report/route.ts`
- Modify: `crm/src/app/dashboard/(main)/bookings/[id]/page.tsx`
- Test: `crm/tests/inspection-pdf.test.ts`

**Interfaces:**
- Produces: Professional PDF document containing branding, customer & booking info, authoritative payment breakdown, 4 inspection photos (front/rear/left/right), Terms & Conditions, Assigned Staff, and Customer Signature section.

- [ ] **Step 1: Implement PDFKit report generator in `crm/src/lib/inspection-pdf.ts`**
Build layout with vector header, metadata tables, 2x2 photo grid, T&C box, and dual signature blocks.

- [ ] **Step 2: Create API route `/api/bookings/[id]/inspection-report`**
Authenticate staff and stream generated PDF with correct caching and headers.

- [ ] **Step 3: Add download button in CRM booking details UI**
Add "Download Inspection Report (PDF)" button in the Inspection section.

- [ ] **Step 4: Write test verifying PDF generation and content integrity**
Run: `tsx --test crm/tests/inspection-pdf.test.ts`

---

### Task 9: Full Verification, Integration Testing & Final Validation

**Files:**
- Test: `crm/tests/*.test.ts`
- Create: `walkthrough.md`

- [ ] **Step 1: Run full unit test suite**
Run: `npm test --prefix crm`

- [ ] **Step 2: Run all integration tests against Supabase**
Run: `npm run test:integration --prefix crm`

- [ ] **Step 3: Run full typecheck and build on both workspaces**
Run: `npm run typecheck --prefix crm` && `npm run typecheck --prefix web`

- [ ] **Step 4: Document changes in walkthrough artifact**
Update `walkthrough.md` with verification results, schema details, and UI links.
