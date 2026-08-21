-- ===========================================================================
-- Enforce Unavailable Vehicle and Blocked Branch Booking Invariants
-- ===========================================================================
--
-- Guarantees that no slot or unit can ever be reserved or booked if:
-- 1. The vehicle itself is marked unavailable, blocked, maintenance, inactive, or archived.
-- 2. The requested branch is blocked (branches.blocked = 1).
-- 3. If no branch is specified, candidate units allocated to a blocked branch are rejected.
-- 4. In fallback mode without units, the vehicle's own primary branch is verified to be unblocked.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Authoritative Unit-Level Reservation RPC with Strict Branch & Status Checks
-- ---------------------------------------------------------------------------
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
  v_vehicle_branch_id BIGINT;
  v_status TEXT;
  v_active INTEGER;
BEGIN
  -- Serializes concurrent callers for the SAME vehicle model
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  -- 1. Check vehicle status and active flag
  SELECT v.status, v.active, v.branch_id
    INTO v_status, v_active, v_vehicle_branch_id
    FROM public.vehicles v
   WHERE v.id = p_vehicle_id;

  -- Strictly reject if vehicle does not exist, is inactive, or not available
  IF v_active IS NULL OR v_active = 0 OR COALESCE(v_status, 'available') NOT IN ('available', 'active') THEN
    RETURN; -- Vehicle is marked unavailable, maintenance, blocked, inactive, etc.
  END IF;

  -- 2. If explicit branch is requested, verify that the branch exists and is NOT blocked
  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(blocked, 0) INTO v_branch_blocked
      FROM public.branches
     WHERE id = p_branch_id AND active = 1;

    IF v_branch_blocked = 1 THEN
      RETURN; -- Branch is out of service / blocked
    END IF;
  ELSE
    -- If no branch is requested, check if the vehicle's own primary branch is blocked
    IF v_vehicle_branch_id IS NOT NULL THEN
      SELECT COALESCE(blocked, 0) INTO v_branch_blocked
        FROM public.branches
       WHERE id = v_vehicle_branch_id AND active = 1;
    END IF;
  END IF;

  -- 3. Find candidate physical unit that:
  --    a. Belongs to this vehicle, active = 1, and status = 'available'
  --    b. If branch specified: is allocated to this branch for requested window AND branch is not blocked
  --    c. If branch NOT specified: unit's current branch and allocation branch must NOT be blocked
  --    d. Has no overlapping availability blocks
  --    e. Has no overlapping active bookings
  FOR v_unit IN
    SELECT u.id, u.unit_identifier, u.current_branch_id
      FROM public.vehicle_units u
     WHERE u.vehicle_id = p_vehicle_id
       AND u.active = 1
       AND u.status = 'available'
       -- Ensure unit's current branch is not blocked
       AND NOT EXISTS (
         SELECT 1
           FROM public.branches b
          WHERE b.id = u.current_branch_id
            AND b.blocked = 1
       )
       -- If branch requested, unit must have valid active allocation for that branch
       AND (
         p_branch_id IS NULL OR EXISTS (
           SELECT 1
             FROM public.branch_allocations ba
             JOIN public.branches b ON b.id = ba.branch_id
            WHERE ba.vehicle_unit_id = u.id
              AND ba.branch_id = p_branch_id
              AND b.blocked = 0
              AND ba.starts_at <= p_pickup_at::timestamptz
              AND (ba.ends_at IS NULL OR ba.ends_at >= p_return_at::timestamptz)
         )
       )
       -- Ensure unit is not actively allocated to a blocked branch during the requested window
       AND NOT EXISTS (
         SELECT 1
           FROM public.branch_allocations ba
           JOIN public.branches b ON b.id = ba.branch_id
          WHERE ba.vehicle_unit_id = u.id
            AND b.blocked = 1
            AND ba.starts_at <= p_pickup_at::timestamptz
            AND (ba.ends_at IS NULL OR ba.ends_at >= p_return_at::timestamptz)
       )
       -- Check availability blocks overlap
       AND NOT EXISTS (
         SELECT 1
           FROM public.availability_blocks b
          WHERE b.vehicle_unit_id = u.id
            AND b.ends_at::timestamptz > p_pickup_at::timestamptz
            AND b.starts_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
            AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW())
       )
       -- Check active bookings overlap
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
      p_pickup_at,
      p_return_at,
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

  -- 4. Fall back to vehicle-level slot hold ONLY if no physical units exist in vehicle_units
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_units WHERE vehicle_id = p_vehicle_id AND active = 1) THEN
    -- If branch was requested or vehicle has a primary branch, ensure it is not blocked
    IF v_branch_blocked = 1 THEN
      RETURN;
    END IF;

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
          p_pickup_at,
          p_return_at,
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

-- ---------------------------------------------------------------------------
-- 2. Backward-Compatible Wrapper for reserve_vehicle_slot
-- ---------------------------------------------------------------------------
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
  v_veh_branch_id BIGINT;
BEGIN
  -- Resolve vehicle's branch if configured
  SELECT branch_id INTO v_veh_branch_id
    FROM public.vehicles
   WHERE id = p_vehicle_id;

  SELECT block_id INTO v_res
    FROM public.reserve_vehicle_unit_slot(
      p_vehicle_id,
      p_pickup_at,
      p_return_at,
      v_veh_branch_id,
      p_exclude_booking_id
    )
    LIMIT 1;

  RETURN v_res.block_id;
END;
$$;

COMMIT;
