-- Database-enforced invariants.
--
-- Each block below fixes a correctness hole that application code alone cannot
-- close, because the failure only appears under concurrency or after a crash.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Reservation holds must expire.
--
-- reserve_vehicle_slot() claims a unit by inserting an availability_blocks row
-- before the booking exists. If the lambda dies (or the weekend-minimum check
-- throws) between the claim and the link, that row has booking_id = NULL and
-- nothing ever removes it — the unit is permanently unbookable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.availability_blocks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.availability_blocks.expires_at IS
  'Only set on unlinked reservation holds. A hold past this time is ignored by availability checks and may be reaped. NULL means a permanent block (a real booking, maintenance, or a manual block).';

CREATE INDEX IF NOT EXISTS idx_availability_blocks_expiry
  ON public.availability_blocks (expires_at)
  WHERE booking_id IS NULL;

-- Releases stale holds. Safe to call from a cron or before an availability read.
CREATE OR REPLACE FUNCTION public.release_expired_holds()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.availability_blocks
   WHERE booking_id IS NULL
     AND expires_at IS NOT NULL
     AND expires_at < NOW();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Terminal bookings must stop blocking inventory.
--
-- Cancelling or completing a booking only wrote bookings.status. The mirrored
-- availability_blocks row stayed, and because a cancelled booking is no longer
-- in the "active bookings" set, its block was counted as an *extra* standalone
-- block — so every cancelled and completed booking blocked its vehicle for its
-- original window, forever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_availability_on_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('Cancelled', 'Completed', 'Rejected')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    DELETE FROM public.availability_blocks WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_release_availability ON public.bookings;
CREATE TRIGGER trg_release_availability
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.release_availability_on_terminal_status();

-- Backfill: clear blocks already stranded by bookings that are terminal today.
DELETE FROM public.availability_blocks b
 USING public.bookings bk
 WHERE b.booking_id = bk.id
   AND bk.status IN ('Cancelled', 'Completed', 'Rejected');

-- ---------------------------------------------------------------------------
-- 3. Availability must ignore expired holds.
--
-- Replaces the function from 20260814_atomic_vehicle_reservation.sql: same
-- advisory-lock behaviour, but stale holds no longer count toward the unit
-- total, and every new hold is stamped with an expiry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_vehicle_slot(
  p_vehicle_id BIGINT,
  p_pickup_at TEXT,
  p_return_at TEXT,
  p_exclude_booking_id BIGINT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_units INTEGER;
  v_booked_count INTEGER;
  v_block_id BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  SELECT total_units INTO v_total_units FROM public.vehicles WHERE id = p_vehicle_id;
  IF v_total_units IS NULL THEN
    RETURN NULL;
  END IF;
  v_total_units := GREATEST(1, v_total_units);

  SELECT COUNT(*) INTO v_booked_count
    FROM public.availability_blocks b
   WHERE b.vehicle_id = p_vehicle_id
     AND b.ends_at::timestamptz > p_pickup_at::timestamptz
     AND b.starts_at::timestamptz < p_return_at::timestamptz
     AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
     -- An unlinked hold that has timed out is not holding anything.
     AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW());

  IF v_booked_count >= v_total_units THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.availability_blocks (vehicle_id, starts_at, ends_at, reason, notes, expires_at)
  VALUES (
    p_vehicle_id, p_pickup_at, p_return_at, 'booked',
    'reserved pending booking creation',
    NOW() + INTERVAL '10 minutes'
  )
  RETURNING id INTO v_block_id;

  RETURN v_block_id;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Customer identity uniqueness.
--
-- findOrCreateCustomer does SELECT-then-INSERT, so two concurrent bookings for
-- the same phone created two customer rows — splitting one person's history.
-- Partial unique indexes so blank/NULL contact fields don't collide with each
-- other. Duplicates are merged onto the lowest id first so the index can build.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Re-point child rows from duplicate customers to the earliest matching row.
  UPDATE public.bookings b
     SET customer_id = keep.min_id
    FROM (
      SELECT phone, MIN(id) AS min_id
        FROM public.customers
       WHERE phone IS NOT NULL AND phone <> ''
       GROUP BY phone HAVING COUNT(*) > 1
    ) keep
    JOIN public.customers dup ON dup.phone = keep.phone AND dup.id <> keep.min_id
   WHERE b.customer_id = dup.id;

  UPDATE public.customer_documents d
     SET customer_id = keep.min_id
    FROM (
      SELECT phone, MIN(id) AS min_id
        FROM public.customers
       WHERE phone IS NOT NULL AND phone <> ''
       GROUP BY phone HAVING COUNT(*) > 1
    ) keep
    JOIN public.customers dup ON dup.phone = keep.phone AND dup.id <> keep.min_id
   WHERE d.customer_id = dup.id;

  DELETE FROM public.customers dup
   USING (
     SELECT phone, MIN(id) AS min_id
       FROM public.customers
      WHERE phone IS NOT NULL AND phone <> ''
      GROUP BY phone HAVING COUNT(*) > 1
   ) keep
   WHERE dup.phone = keep.phone AND dup.id <> keep.min_id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone
  ON public.customers (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- ---------------------------------------------------------------------------
-- 5. One handover and one return per booking.
--
-- recordInspection inserted unconditionally. A second 'return' inspection
-- re-ran the late-fee and extra-km calculation and called
-- increment_booking_total again, charging the customer twice.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspections_booking_kind
  ON public.inspections (booking_id, kind);

-- ---------------------------------------------------------------------------
-- 6. Refunds cannot exceed what was actually captured.
--
-- Nothing stopped several refund rows on one booking summing past the amount
-- paid. Enforced in the database because two concurrent approvals can each pass
-- an application-level check.
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_amounts_non_negative;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_amounts_non_negative
  CHECK (
    (requested_amount IS NULL OR requested_amount >= 0)
    AND (approved_amount IS NULL OR approved_amount >= 0)
  );

CREATE OR REPLACE FUNCTION public.assert_refund_within_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_paid NUMERIC;
  v_committed NUMERIC;
  v_this NUMERIC;
BEGIN
  -- Only states that actually move money count against the cap.
  IF NEW.status NOT IN ('Approved', 'Processing', 'Completed') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(paid_amount, 0) INTO v_paid
    FROM public.bookings WHERE id = NEW.booking_id;
  IF v_paid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(COALESCE(approved_amount, requested_amount, 0)), 0)
    INTO v_committed
    FROM public.refunds
   WHERE booking_id = NEW.booking_id
     AND id IS DISTINCT FROM NEW.id
     AND status IN ('Approved', 'Processing', 'Completed');

  v_this := COALESCE(NEW.approved_amount, NEW.requested_amount, 0);

  IF v_committed + v_this > v_paid THEN
    RAISE EXCEPTION
      'Refund exceeds captured amount for booking % (paid %, already committed %, this refund %)',
      NEW.booking_id, v_paid, v_committed, v_this
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refund_within_paid ON public.refunds;
CREATE TRIGGER trg_refund_within_paid
  BEFORE INSERT OR UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_refund_within_paid();

-- ---------------------------------------------------------------------------
-- 7. Payment amounts must be positive.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount IS NULL OR amount >= 0);
