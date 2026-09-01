-- Document/inspection pipeline indexes, derived from the queries this codebase actually
-- runs — not speculative. Each one below names the call site that needs it.
--
-- Context: Supabase Pro + Micro compute. Every sequential scan here is paid for in CPU
-- on the smallest instance size, on the hottest path in the app (booking detail page +
-- every PDF generation).

-- 1. inspection_photos had ONLY a primary key. Every read of it filters by
--    inspection_id and never by id:
--      - inspection-pdf.ts generateInspectionPdf():
--          select=*&or=(inspection_id.eq.X,inspection_id.eq.Y)
--      - bookings/[id]/page.tsx: photos for the booking's inspections
--    At 100 bookings/day x 12 photos that table grows ~36k rows/month, all seq-scanned.
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection
  ON public.inspection_photos (inspection_id);

-- 2. customer_documents was indexed on customer_id (twice — see the drops below) but
--    NOT on booking_id, which is what every hot query actually filters on:
--      - bookings/[id]/page.tsx:  select=*&booking_id=eq.X
--      - inspection-pdf.ts:       select=*&booking_id=eq.X
--      - payment-actions.ts:      sbCount(booking_id=eq.X&verified=eq.0)
--      - createManualBooking:     document inserts/reads per booking
CREATE INDEX IF NOT EXISTS idx_customer_documents_booking
  ON public.customer_documents (booking_id);

-- 3. Exact-duplicate indexes. Postgres maintains every one of these on INSERT/UPDATE,
--    so a duplicate is pure write amplification plus wasted storage, with zero read
--    benefit — the planner only ever uses one of each pair. Dropping the redundant
--    copy, keeping the more descriptively named one in each case.
DROP INDEX IF EXISTS public.idx_customer_docs_customer;      -- dupe of idx_customer_documents_customer
DROP INDEX IF EXISTS public.idx_bookings_customer;           -- dupe of idx_bookings_customer_id
DROP INDEX IF EXISTS public.idx_payments_booking;            -- dupe of idx_payments_booking_id
DROP INDEX IF EXISTS public.idx_payments_rzp_payment;        -- dupe of idx_payments_rzp_payment_id
