-- Walk-in / offline bookings created by staff in the CRM.
--
-- Until now every booking came from the online checkout, so createBooking() always
-- produced status 'Pending payment' with a 15-minute payment_window_expires_at. A
-- staff-created walk-in booking must never enter that lifecycle: release_expired_-
-- reservations() would reject it and free the vehicle 15 minutes later, while the
-- customer is still at the counter.
--
-- `source` makes the two kinds distinguishable, which the reservation TTL and the
-- reporting both need.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online';

-- Everything that exists today came through the website.
UPDATE public.bookings SET source = 'online' WHERE source IS NULL;

COMMENT ON COLUMN public.bookings.source IS
  'online = customer checkout (subject to the 15-minute payment window); manual = created by staff in the CRM for a walk-in, no payment window.';

-- Belt and braces: a manual booking has no payment window, so it can never be
-- expired. Both TTL functions already key off status = 'Pending payment', which
-- manual bookings do not use, but state it explicitly so a future status change
-- cannot accidentally make walk-in bookings expirable.
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
       AND COALESCE(b.source, 'online') <> 'manual'
       AND COALESCE(b.payment_window_expires_at, b.created_at + INTERVAL '15 minutes') <= NOW()
       AND COALESCE(b.paid_amount, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id AND p.status = 'Paid'
       )
  );
$$;

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
       AND COALESCE(b.source, 'online') <> 'manual'
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
