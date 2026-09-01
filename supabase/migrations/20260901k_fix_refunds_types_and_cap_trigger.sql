-- The live `refunds` table drifted from schema.sql's design: it still carries its
-- pre-Supabase-migration SQLite typing (TEXT timestamps, floating-point money)
-- instead of the TIMESTAMP WITH TIME ZONE / NUMERIC(10,2) columns schema.sql has
-- always declared — it never got the same type-hardening pass bookings/payments
-- did in 20260825_timestamps_to_timestamptz.sql. The table is empty in production
-- as of this migration, so these conversions carry no data-loss risk; a `::` cast
-- also transparently handles either the ISO strings the app writes or the
-- `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')` default the old TEXT columns had, so
-- this is still safe even if a row is written between review and deploy.

ALTER TABLE public.refunds
  ALTER COLUMN requested_amount TYPE NUMERIC(10, 2) USING requested_amount::numeric(10, 2),
  ALTER COLUMN approved_amount TYPE NUMERIC(10, 2) USING approved_amount::numeric(10, 2);

-- The old TEXT column's own default (to_char(...)) has to go before the type change —
-- Postgres won't auto-cast a column default expression the way it casts existing rows.
ALTER TABLE public.refunds ALTER COLUMN requested_at DROP DEFAULT;

ALTER TABLE public.refunds
  ALTER COLUMN requested_at TYPE TIMESTAMP WITH TIME ZONE USING requested_at::timestamptz,
  ALTER COLUMN approved_at TYPE TIMESTAMP WITH TIME ZONE USING approved_at::timestamptz,
  ALTER COLUMN completed_at TYPE TIMESTAMP WITH TIME ZONE USING completed_at::timestamptz;

ALTER TABLE public.refunds ALTER COLUMN requested_at SET DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- assert_refund_within_paid() (from 20260814_integrity_invariants.sql) capped a
-- refund against the booking's paid_amount, but its status list — both for whether
-- THIS row counts, and for summing already-committed refunds on the SAME booking —
-- was missing 'Partially approved'. That status commits real money exactly like
-- 'Approved' does (decideRefund/CompleteRefundForm treat them identically), so:
--   1. A "Partially approved" row's own amount was never checked against paid_amount.
--   2. A "Partially approved" row was invisible to the SUM check on every OTHER
--      refund for that booking — two refunds on one booking, each individually
--      under the cap (one "Partially approved", one then "Approved"), could
--      together exceed what was ever paid, and the trigger would let both through.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_refund_within_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_paid NUMERIC;
  v_committed NUMERIC;
  v_this NUMERIC;
BEGIN
  IF NEW.status NOT IN ('Approved', 'Partially approved', 'Processing', 'Completed') THEN
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
     AND status IN ('Approved', 'Partially approved', 'Processing', 'Completed');

  v_this := COALESCE(NEW.approved_amount, NEW.requested_amount, 0);

  IF v_committed + v_this > v_paid THEN
    RAISE EXCEPTION
      'Refund exceeds captured amount for booking % (paid %, already committed %, this refund %)',
      NEW.booking_id, v_paid, v_committed, v_this
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;
