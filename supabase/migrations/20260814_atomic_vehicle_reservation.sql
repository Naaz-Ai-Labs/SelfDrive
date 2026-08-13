-- Closes a real race condition: checkVehicleAvailable() and the booking insert that
-- follows it are two SEPARATE PostgREST calls, each its own transaction. Two
-- customers requesting the last available unit at nearly the same instant could
-- both pass the availability check before either one's booking exists — both get
-- confirmed, one vehicle, double-booked.
--
-- This function does the count-and-claim in ONE transaction, serialized per vehicle
-- with a transaction-scoped advisory lock, so the second caller genuinely sees the
-- first caller's claim before deciding.
--
-- Usage from the app: call this FIRST. If it returns a block id, the slot is
-- claimed — proceed to create the booking, then UPDATE that block row's
-- booking_id to link it (never insert a second block for the same booking). If it
-- returns NULL, the vehicle is genuinely unavailable for that window.

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
  -- Serializes concurrent callers for the SAME vehicle only. Held for the life of
  -- this transaction (i.e. this single function call) and released automatically
  -- on return — nothing to clean up, nothing that can be left locked.
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  SELECT total_units INTO v_total_units FROM public.vehicles WHERE id = p_vehicle_id;
  IF v_total_units IS NULL THEN
    RETURN NULL; -- vehicle does not exist
  END IF;
  v_total_units := GREATEST(1, v_total_units);

  -- Overlap test: NOT (existing.ends <= new.pickup OR existing.starts >= new.return).
  -- Counts confirmed bookings (via their mirrored availability_blocks row) and
  -- standalone holds (maintenance/manual blocks) the same way the application-level
  -- check already does, so behaviour is identical — just atomic.
  SELECT COUNT(*) INTO v_booked_count
    FROM public.availability_blocks b
   WHERE b.vehicle_id = p_vehicle_id
     AND b.ends_at::timestamptz > p_pickup_at::timestamptz
     AND b.starts_at::timestamptz < p_return_at::timestamptz
     AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id);

  IF v_booked_count >= v_total_units THEN
    RETURN NULL; -- no free unit for this window
  END IF;

  -- Claim the slot immediately, inside the same locked transaction. booking_id is
  -- left NULL here; the caller links it once the booking row exists.
  INSERT INTO public.availability_blocks (vehicle_id, starts_at, ends_at, reason, notes)
  VALUES (p_vehicle_id, p_pickup_at, p_return_at, 'booked', 'reserved pending booking creation')
  RETURNING id INTO v_block_id;

  RETURN v_block_id;
END;
$$;

COMMENT ON FUNCTION public.reserve_vehicle_slot IS
  'Atomically checks and claims one vehicle unit for a date range. Returns the claimed availability_blocks.id, or NULL if no unit is free. Call BEFORE creating the booking, then UPDATE the returned block row with the real booking_id.';
