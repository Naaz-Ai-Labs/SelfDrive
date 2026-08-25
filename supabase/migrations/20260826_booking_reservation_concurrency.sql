-- Booking/payment concurrency hardening.
--
-- Two new, additive, nullable columns + partial unique indexes. Neither can conflict
-- with existing data: idempotency_key and attempt_number do not exist yet, so every
-- existing row has them NULL, and the indexes below explicitly exclude NULLs.
--
-- 1. bookings.idempotency_key — a client-generated key (one per logical "start
--    booking" attempt, unchanged across retries of that same attempt) so a
--    double-click, browser retry, or a lost HTTP response after the DB write
--    succeeded returns the SAME booking instead of claiming a second unit.
--
-- 2. payments.attempt_number — a deterministic 1/2/3 counter per booking, protected
--    by a unique constraint rather than trusted from application-side counting
--    alone (two concurrent order-creation calls for the same booking cannot both
--    become "attempt 2").

BEGIN;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_idempotency_key
  ON public.bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS attempt_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_booking_attempt
  ON public.payments (booking_id, attempt_number)
  WHERE booking_id IS NOT NULL AND attempt_number IS NOT NULL;

COMMIT;
