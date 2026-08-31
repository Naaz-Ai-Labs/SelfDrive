-- ONE authoritative reservation/payment deadline.
--
-- Before this, the 15-minute window was RECOMPUTED in three places from created_at:
-- is_expired_reservation() and release_expired_reservations() used the Postgres clock
-- (NOW() - INTERVAL '15 minutes'), while hydrateVehicles() used the Vercel lambda
-- clock (Date.now() - 15*60*1000). Two clocks, three derivations, no stored value —
-- and nothing the frontend could display, so any countdown would have been a fourth
-- independent deadline.
--
-- Now: the deadline is a column, written once when the reservation is created, and
-- every consumer reads that one value.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_window_expires_at TIMESTAMPTZ;

-- New reservations get their deadline from the database clock at insert time, so the
-- application cannot forget to set it or set it from a skewed lambda clock.
ALTER TABLE public.bookings
  ALTER COLUMN payment_window_expires_at SET DEFAULT (NOW() + INTERVAL '15 minutes');

-- Backfill: existing rows keep exactly the deadline they were already being judged
-- against (created_at + 15 min), so no live reservation's effective expiry moves.
UPDATE public.bookings
   SET payment_window_expires_at = created_at + INTERVAL '15 minutes'
 WHERE payment_window_expires_at IS NULL;

-- Single definition of "this reservation's window has closed", used by the RPC, the
-- sweep, and the attempt gate below.
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
       -- COALESCE only covers a row inserted before the column existed; the backfill
       -- above means there should be none.
       AND COALESCE(b.payment_window_expires_at, b.created_at + INTERVAL '15 minutes') <= NOW()
       AND COALESCE(b.paid_amount, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id AND p.status = 'Paid'
       )
  );
$$;

-- The rule's four conditions for allowing a payment attempt, evaluated together
-- against the database clock in one read. Returns 'ok', or the reason it refused.
--
-- createBookingPaymentOrder() previously checked only the attempt count and "already
-- fully paid" — never the booking's status or its window. So once the window closed
-- and the unit had been released to another customer, the original customer could
-- still open attempt 2 or 3 and pay for a vehicle that was no longer theirs.
CREATE OR REPLACE FUNCTION public.can_start_payment_attempt(p_booking_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_status TEXT;
  v_expires TIMESTAMPTZ;
  v_paid NUMERIC;
  v_attempts INTEGER;
  v_has_paid BOOLEAN;
BEGIN
  SELECT b.status,
         COALESCE(b.payment_window_expires_at, b.created_at + INTERVAL '15 minutes'),
         COALESCE(b.paid_amount, 0)
    INTO v_status, v_expires, v_paid
    FROM public.bookings b
   WHERE b.id = p_booking_id;

  IF v_status IS NULL THEN RETURN 'not_found'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = p_booking_id AND p.status = 'Paid')
    INTO v_has_paid;

  -- Terminating condition 1 wins over everything: a verified payment stops further
  -- attempts rather than failing them.
  IF v_has_paid OR v_paid > 0 THEN RETURN 'already_paid'; END IF;

  IF v_status <> 'Pending payment' THEN RETURN 'not_active'; END IF;

  -- Terminating condition 3.
  IF v_expires <= NOW() THEN RETURN 'window_closed'; END IF;

  -- Terminating condition 2.
  SELECT COUNT(*) INTO v_attempts FROM public.payments WHERE booking_id = p_booking_id;
  IF v_attempts >= 3 THEN RETURN 'attempts_exhausted'; END IF;

  RETURN 'ok';
END;
$$;

COMMIT;
