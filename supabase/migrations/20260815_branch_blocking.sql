-- Branch-level blocking.
--
-- An admin can take a whole branch out of service. Every vehicle at that branch
-- stops being bookable and greys out on the website, without touching the vehicles
-- themselves — so unblocking restores the previous per-vehicle state exactly.
--
-- Existing bookings at a blocked branch are deliberately left alone: blocking is an
-- inventory control, not a cancellation. Staff continue to service them normally.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS blocked_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

COMMENT ON COLUMN public.branches.blocked IS
  '1 = no new bookings may be taken for any vehicle at this branch. Existing bookings are unaffected. Admin-only.';

CREATE INDEX IF NOT EXISTS idx_branches_blocked ON public.branches (blocked) WHERE blocked = 1;

-- ---------------------------------------------------------------------------
-- The authoritative gate.
--
-- reserve_vehicle_slot() is the single place a unit is claimed, so refusing here
-- means a blocked branch cannot be booked through ANY path — the website, the
-- emergency fallback, or a stale browser tab that still shows the old catalogue.
-- A UI that greys the card is a courtesy; this is the guarantee.
--
-- Everything else about the function is unchanged from
-- 20260814_integrity_invariants.sql: same advisory lock, same expiry handling.
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
  v_branch_blocked INTEGER;
  v_status TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  SELECT v.total_units, v.status, COALESCE(b.blocked, 0)
    INTO v_total_units, v_status, v_branch_blocked
    FROM public.vehicles v
    LEFT JOIN public.branches b ON b.id = v.branch_id
   WHERE v.id = p_vehicle_id;

  IF v_total_units IS NULL THEN
    RETURN NULL; -- vehicle does not exist
  END IF;

  -- Branch out of service, or the vehicle itself withdrawn.
  IF v_branch_blocked = 1 OR COALESCE(v_status, 'available') <> 'available' THEN
    RETURN NULL;
  END IF;

  v_total_units := GREATEST(1, v_total_units);

  SELECT COUNT(*) INTO v_booked_count
    FROM public.availability_blocks b
   WHERE b.vehicle_id = p_vehicle_id
     AND b.ends_at::timestamptz > p_pickup_at::timestamptz
     AND b.starts_at::timestamptz < p_return_at::timestamptz
     AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
     AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW());

  IF v_booked_count >= v_total_units THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.availability_blocks (vehicle_id, starts_at, ends_at, reason, notes, expires_at)
  VALUES (p_vehicle_id, p_pickup_at, p_return_at, 'booked',
          'reserved pending booking creation', NOW() + INTERVAL '10 minutes')
  RETURNING id INTO v_block_id;

  RETURN v_block_id;
END $$;

COMMIT;
