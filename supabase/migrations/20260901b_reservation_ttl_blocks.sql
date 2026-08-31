-- Follow-up to 20260901_reservation_ttl_and_fleet_consistency.sql.
--
-- That migration expired an abandoned reservation on the BOOKINGS side of
-- reserve_vehicle_unit_slot, but a reservation holds its unit through TWO rows: the
-- booking, and the availability_blocks row linked to it. The blocks clause only
-- exempts holds with a NULL booking_id (anonymous 10-minute claims), so a linked
-- block from an abandoned reservation kept occupying the unit forever and the RPC
-- still refused a new customer — verified by integration Test 12, which failed
-- against the first migration and passes against this one.
--
-- The same predicate now lives in one function used by both clauses instead of being
-- written twice.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_expired_reservation(p_booking_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.status = 'Pending payment'
       AND b.created_at < NOW() - INTERVAL '15 minutes'
       -- Any money against the booking keeps its unit, so a payment captured moments
       -- before its status flips can never have its inventory freed underneath it.
       AND COALESCE(b.paid_amount, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id AND p.status = 'Paid'
       )
  );
$$;

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

  IF v_active IS NULL OR v_active = 0 OR COALESCE(v_status, 'available') <> 'available' THEN
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
       AND u.status = 'available'
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
            -- NEW: a block still linked to an abandoned reservation must not occupy
            -- the unit either.
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

-- Keep the sweep's definition of "expired" identical to the RPC's.
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_booking RECORD;
BEGIN
  DELETE FROM public.availability_blocks
   WHERE booking_id IS NULL AND expires_at IS NOT NULL AND expires_at < NOW();

  FOR v_booking IN
    SELECT b.id FROM public.bookings b
     WHERE b.status = 'Pending payment'
       AND public.is_expired_reservation(b.id)
  LOOP
    UPDATE public.bookings
       SET status = 'Rejected',
           notes = COALESCE(notes || E'\n', '') || 'Reservation expired after 15 minutes with no completed payment.',
           updated_at = NOW()
     WHERE id = v_booking.id AND status = 'Pending payment';

    IF FOUND THEN
      DELETE FROM public.availability_blocks WHERE booking_id = v_booking.id;
      INSERT INTO public.booking_history (booking_id, action, detail, created_at)
      VALUES (v_booking.id, 'reservation_expired', '{"reason":"15-minute TTL exceeded, no payment"}', NOW());
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMIT;
