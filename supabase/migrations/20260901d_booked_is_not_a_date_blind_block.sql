-- "booked" is not an availability reason.
--
-- reserve_vehicle_unit_slot refused a vehicle whose vehicles.status or
-- vehicle_units.status was 'booked' BEFORE it looked at any date. That flag is set at
-- HANDOVER (lib/actions.ts) to record "this unit is physically out right now" — a
-- statement about today, used as a permanent gate on every future date. Live effect:
-- vehicles 4, 5 and 239 were unbookable for ANY date, indefinitely, because one of
-- their units was out with a customer; actions.ts additionally escalates it to the
-- whole vehicle model, so every other unit of that model dies with it.
--
-- Real date-blind reasons (maintenance, blocked, unavailable, inactive, archived) stay
-- hard blocks. Occupancy is already decided, date-scoped, by the bookings and
-- availability_blocks checks further down — 'booked' only duplicated that, wrongly.

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
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  SELECT v.status, v.active INTO v_status, v_active
    FROM public.vehicles v WHERE v.id = p_vehicle_id;

  -- 'booked' deliberately absent: it means "out right now", not "never bookable".
  IF v_active IS NULL OR v_active = 0
     OR COALESCE(v_status, 'available') IN ('maintenance','blocked','unavailable','inactive','archived') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(blocked, 0) INTO v_branch_blocked FROM public.branches WHERE id = p_branch_id;
    IF v_branch_blocked = 1 THEN RETURN; END IF;
  END IF;

  FOR v_unit IN
    SELECT u.id, u.unit_identifier
      FROM public.vehicle_units u
     WHERE u.vehicle_id = p_vehicle_id
       AND u.active = 1
       -- Same reasoning at unit level: a unit out on today's rental is still bookable
       -- for a window that does not overlap it. The overlap checks below decide that.
       AND COALESCE(u.status, 'available') NOT IN ('maintenance','blocked','unavailable','inactive','archived')
       AND (
         p_branch_id IS NULL OR EXISTS (
           SELECT 1 FROM public.branch_allocations ba
            WHERE ba.vehicle_unit_id = u.id
              AND ba.branch_id = p_branch_id
              AND ba.starts_at <= p_pickup_at::timestamptz
              AND (ba.ends_at IS NULL OR ba.ends_at >= p_return_at::timestamptz)
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.availability_blocks b
          WHERE b.vehicle_unit_id = u.id
            AND b.ends_at::timestamptz > p_pickup_at::timestamptz
            AND b.starts_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
            AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW())
            AND NOT (b.booking_id IS NOT NULL AND public.is_expired_reservation(b.booking_id))
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings bk
          WHERE bk.vehicle_unit_id = u.id
            AND bk.status NOT IN ('Cancelled', 'Completed', 'Rejected', 'Draft')
            AND bk.return_at::timestamptz > p_pickup_at::timestamptz
            AND bk.pickup_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR bk.id IS DISTINCT FROM p_exclude_booking_id)
            AND NOT public.is_expired_reservation(bk.id)
       )
     ORDER BY u.id ASC
     LIMIT 1
  LOOP
    INSERT INTO public.availability_blocks (
      vehicle_id, vehicle_unit_id, starts_at, ends_at, reason, notes, expires_at
    ) VALUES (
      p_vehicle_id, v_unit.id, p_pickup_at::timestamptz, p_return_at::timestamptz,
      'booked', format('reserved unit %s pending booking creation', v_unit.unit_identifier),
      NOW() + INTERVAL '10 minutes'
    )
    RETURNING id INTO v_block_id;

    block_id := v_block_id; unit_id := v_unit.id; unit_identifier := v_unit.unit_identifier;
    RETURN NEXT; RETURN;
  END LOOP;

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
         AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW())
         AND NOT (b.booking_id IS NOT NULL AND public.is_expired_reservation(b.booking_id));

      IF v_booked_count < v_total_units THEN
        INSERT INTO public.availability_blocks (
          vehicle_id, starts_at, ends_at, reason, notes, expires_at
        ) VALUES (
          p_vehicle_id, p_pickup_at::timestamptz, p_return_at::timestamptz,
          'booked', 'reserved pending booking creation', NOW() + INTERVAL '10 minutes'
        )
        RETURNING id INTO v_block_id;

        block_id := v_block_id; unit_id := NULL; unit_identifier := NULL;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  RETURN;
END;
$$;

-- Clear the model-level flag that handover escalation left behind. The per-unit flag
-- is kept: it is accurate operational information ("this one is physically out"), and
-- is no longer read as a date-blind block.
UPDATE public.vehicles
   SET status = 'available', updated_at = NOW()
 WHERE active = 1 AND status = 'booked';

COMMIT;
