-- Fixes reserve_vehicle_unit_slot / reserve_vehicle_slot, broken by the earlier
-- 20260825_timestamps_to_timestamptz.sql migration: availability_blocks.starts_at/
-- ends_at became `timestamptz`, but these functions' INSERT statements still hand them
-- a bare `text` parameter with no cast, which Postgres refuses:
--   42804: column "starts_at" is of type timestamp with time zone but expression is
--   of type text
--
-- This has been silently failing every atomic slot claim since that migration ran —
-- every booking since has instead gone through a capacity-blind fallback path, which is
-- the real mechanism behind two customers both getting booked for the same vehicle.
--
-- Only change from the original definition (20260818_authoritative_availability_rpc.sql):
-- explicit ::timestamptz casts on p_pickup_at / p_return_at in both INSERT statements.
-- Everything else — the advisory lock, the unit search, the fallback vehicle-count
-- check — is untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_vehicle_unit_slot(
  p_vehicle_id BIGINT,
  p_pickup_at TEXT,
  p_return_at TEXT,
  p_branch_id BIGINT DEFAULT NULL,
  p_exclude_booking_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  block_id BIGINT,
  unit_id BIGINT,
  unit_identifier TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit RECORD;
  v_block_id BIGINT;
  v_branch_blocked INTEGER := 0;
  v_status TEXT;
  v_active INTEGER;
BEGIN
  -- Serializes concurrent callers for the SAME vehicle model
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  -- Check vehicle status
  SELECT v.status, v.active
    INTO v_status, v_active
    FROM public.vehicles v
   WHERE v.id = p_vehicle_id;

  IF v_active IS NULL OR v_active = 0 OR COALESCE(v_status, 'available') <> 'available' THEN
    RETURN; -- Vehicle does not exist, is inactive, or not available
  END IF;

  -- If branch is specified, verify that the branch is not blocked
  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(blocked, 0) INTO v_branch_blocked
      FROM public.branches
     WHERE id = p_branch_id;

    IF v_branch_blocked = 1 THEN
      RETURN; -- Branch is out of service
    END IF;
  END IF;

  -- Find the first candidate physical unit that:
  -- 1. Belongs to this vehicle and is active and available
  -- 2. If branch is specified: is allocated to this branch for the ENTIRE requested window
  -- 3. Has no overlapping availability blocks
  -- 4. Has no overlapping active bookings
  FOR v_unit IN
    SELECT u.id, u.unit_identifier
      FROM public.vehicle_units u
     WHERE u.vehicle_id = p_vehicle_id
       AND u.active = 1
       AND u.status = 'available'
       AND (
         p_branch_id IS NULL OR EXISTS (
           SELECT 1
             FROM public.branch_allocations ba
            WHERE ba.vehicle_unit_id = u.id
              AND ba.branch_id = p_branch_id
              AND ba.starts_at <= p_pickup_at::timestamptz
              AND (ba.ends_at IS NULL OR ba.ends_at >= p_return_at::timestamptz)
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.availability_blocks b
          WHERE b.vehicle_unit_id = u.id
            AND b.ends_at::timestamptz > p_pickup_at::timestamptz
            AND b.starts_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
            AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW())
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.bookings bk
          WHERE bk.vehicle_unit_id = u.id
            AND bk.status NOT IN ('Cancelled', 'Completed', 'Rejected', 'Draft')
            AND bk.return_at::timestamptz > p_pickup_at::timestamptz
            AND bk.pickup_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR bk.id IS DISTINCT FROM p_exclude_booking_id)
       )
     ORDER BY u.id ASC
     LIMIT 1
  LOOP
    -- Insert atomic temporary hold for 10 minutes
    INSERT INTO public.availability_blocks (
      vehicle_id,
      vehicle_unit_id,
      starts_at,
      ends_at,
      reason,
      notes,
      expires_at
    ) VALUES (
      p_vehicle_id,
      v_unit.id,
      p_pickup_at::timestamptz,
      p_return_at::timestamptz,
      'booked',
      format('reserved unit %s pending booking creation', v_unit.unit_identifier),
      NOW() + INTERVAL '10 minutes'
    )
    RETURNING id INTO v_block_id;

    block_id := v_block_id;
    unit_id := v_unit.id;
    unit_identifier := v_unit.unit_identifier;
    RETURN NEXT;
    RETURN;
  END LOOP;

  -- If no specific physical unit was found, fall back to legacy unit-count check
  -- only if no physical units exist at all for this vehicle
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_units WHERE vehicle_id = p_vehicle_id AND active = 1) THEN
    DECLARE
      v_total_units INTEGER;
      v_booked_count INTEGER;
    BEGIN
      SELECT GREATEST(1, COALESCE(total_units, 1)) INTO v_total_units
        FROM public.vehicles WHERE id = p_vehicle_id;

      SELECT COUNT(*) INTO v_booked_count
        FROM public.availability_blocks b
       WHERE b.vehicle_id = p_vehicle_id
         AND b.ends_at::timestamptz > p_pickup_at::timestamptz
         AND b.starts_at::timestamptz < p_return_at::timestamptz
         AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
         AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW());

      IF v_booked_count < v_total_units THEN
        INSERT INTO public.availability_blocks (
          vehicle_id,
          starts_at,
          ends_at,
          reason,
          notes,
          expires_at
        ) VALUES (
          p_vehicle_id,
          p_pickup_at::timestamptz,
          p_return_at::timestamptz,
          'booked',
          'reserved pending booking creation',
          NOW() + INTERVAL '10 minutes'
        )
        RETURNING id INTO v_block_id;

        block_id := v_block_id;
        unit_id := NULL;
        unit_identifier := NULL;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_vehicle_slot(
  p_vehicle_id BIGINT,
  p_pickup_at TEXT,
  p_return_at TEXT,
  p_exclude_booking_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT block_id INTO v_res
    FROM public.reserve_vehicle_unit_slot(
      p_vehicle_id,
      p_pickup_at,
      p_return_at,
      NULL,
      p_exclude_booking_id
    )
    LIMIT 1;

  RETURN v_res.block_id;
END;
$$;

COMMIT;
