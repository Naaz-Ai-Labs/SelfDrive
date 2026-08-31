-- Reservation TTL enforcement + fleet/branch consistency cleanup.
--
-- Written during a live production audit (2026-08-31/09-01). Applied directly to
-- production via the Supabase Management API in the same session this file was
-- written, then committed here for the repo's own migration history — so this file
-- documents what is already live, it is not "pending".
--
-- SECTION 1 — Reservation TTL (business rule: 15-minute TTL, enforced DB-side, never
-- a Vercel timer).
--
-- A "Pending payment" booking IS the reservation in this codebase (there is no
-- separate reservations table — the booking row itself, in that status, holds the
-- unit). Before this migration, nothing ever expired a reservation that never even
-- reached a payment attempt: recordFailedPaymentAttempt()/releaseBookingReservation()
-- only fire after 3 failed *attempts*, so a customer who opened checkout once and
-- then abandoned the tab (no dismiss event, no attempt recorded) held a unit forever.
-- Confirmed live: 3 "Pending payment" bookings already over 3 hours old with a single
-- attempt each, permanently blocking their vehicle_unit_id for every future customer
-- asking about those dates.
--
-- Fix is enforced at the one place it actually matters — the reservation RPCs' own
-- overlap check — so it is lazy/reactive (checked every time a NEW reservation is
-- attempted, using NOW() at query time) rather than depending on any scheduled job.
-- A companion sweep function formally releases genuinely stale rows so the CRM does
-- not accumulate phantom "Pending payment" bookings forever, but the actual inventory
-- guarantee does not depend on that sweep ever running.

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

  SELECT v.status, v.active
    INTO v_status, v_active
    FROM public.vehicles v
   WHERE v.id = p_vehicle_id;

  IF v_active IS NULL OR v_active = 0 OR COALESCE(v_status, 'available') <> 'available' THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(blocked, 0) INTO v_branch_blocked
      FROM public.branches
     WHERE id = p_branch_id;

    IF v_branch_blocked = 1 THEN
      RETURN;
    END IF;
  END IF;

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
            -- Reservation TTL: a "Pending payment" booking older than 15 minutes with
            -- no successful payment is an abandoned reservation, not a real hold. It
            -- must not block a genuinely new customer just because nobody has swept
            -- it yet — the DB timestamp is checked live, every time.
            AND NOT (
              bk.status = 'Pending payment'
              AND bk.created_at < NOW() - INTERVAL '15 minutes'
              AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = bk.id AND p.status = 'Paid')
            )
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

    block_id := v_block_id;
    unit_id := v_unit.id;
    unit_identifier := v_unit.unit_identifier;
    RETURN NEXT;
    RETURN;
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
         AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW());

      IF v_booked_count < v_total_units THEN
        INSERT INTO public.availability_blocks (
          vehicle_id, starts_at, ends_at, reason, notes, expires_at
        ) VALUES (
          p_vehicle_id, p_pickup_at::timestamptz, p_return_at::timestamptz,
          'booked', 'reserved pending booking creation', NOW() + INTERVAL '10 minutes'
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

-- SECTION 2 — Formal sweep: actually transitions abandoned reservations to Rejected
-- (Section 1 only stops them blocking NEW reservations; without this they would sit
-- as "Pending payment" in the CRM forever). Mirrors releaseBookingReservation()'s own
-- safety logic (CAS on status, re-verify no Paid payment before releasing) so it is
-- safe to call from anywhere, any number of times, concurrently.
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_booking RECORD;
BEGIN
  -- Housekeeping: expired anonymous (no booking) temp holds are already ignored by
  -- every reader, but never actually removed. Sweep them here too.
  DELETE FROM public.availability_blocks
   WHERE booking_id IS NULL AND expires_at IS NOT NULL AND expires_at < NOW();

  FOR v_booking IN
    SELECT b.id
      FROM public.bookings b
     WHERE b.status = 'Pending payment'
       AND b.created_at < NOW() - INTERVAL '15 minutes'
       AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status = 'Paid')
  LOOP
    UPDATE public.bookings
       SET status = 'Rejected',
           notes = COALESCE(notes || E'\n', '') || 'Reservation expired after 15 minutes with no completed payment.',
           updated_at = NOW()
     WHERE id = v_booking.id
       AND status = 'Pending payment';

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

-- SECTION 3 — Fleet/branch consistency backfill + guard against recurrence.
--
-- Confirmed live: unit 1401 (Maruti Ciaz) had current_branch_id=2 (Hassan) while its
-- own open-ended branch_allocations row said branch_id=1 (Sakleshpura) — a staff
-- reassignment that updated one and not the other. The reservation RPC trusts
-- branch_allocations; the public listing trusts current_branch_id; disagreement
-- between them is exactly "search shows it, booking fails" for that branch.
UPDATE public.vehicle_units u
   SET current_branch_id = ba.branch_id,
       updated_at = NOW()
  FROM public.branch_allocations ba
 WHERE ba.vehicle_unit_id = u.id
   AND ba.ends_at IS NULL
   AND ba.branch_id IS DISTINCT FROM u.current_branch_id;

-- Confirmed live: 15 availability_blocks rows referencing booking_ids that no longer
-- exist (deleted directly by test/maintenance scripts over the project's history —
-- the application itself never hard-deletes a booking, only ever UPDATEs its status).
-- The reservation RPC does not verify a block's booking_id still resolves to a real
-- row, so a dangling block permanently occupies its unit/date-window for nothing.
DELETE FROM public.availability_blocks ab
 WHERE ab.booking_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = ab.booking_id);

-- Prevents recurrence of the above from any future direct deletion.
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

-- Confirmed live: vehicle_units.status stuck at 'booked' with no actual currently-out
-- booking (status is only ever set to 'booked' at handover, alongside
-- actual_pickup_at — a unit with no booking that has actual_pickup_at set and
-- actual_return_at still null was left stuck by an earlier booking that reached
-- handover and was later rejected/cancelled without a formal return inspection,
-- which is the only code path that resets it back to 'available'). Units genuinely
-- out right now (actual_pickup_at set, actual_return_at null) are correctly left
-- untouched.
UPDATE public.vehicle_units u
   SET status = 'available', updated_at = NOW()
 WHERE u.status = 'booked'
   AND NOT EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.vehicle_unit_id = u.id
        AND b.actual_pickup_at IS NOT NULL
        AND b.actual_return_at IS NULL
   );

COMMIT;
