-- Convert the booking-critical timestamp columns from `text` to `timestamptz`.
--
-- WHY
-- ---
-- Every timestamp in this schema was stored as text, so Postgres normalised nothing and
-- four incompatible shapes accumulated in the same columns:
--
--   2026-08-24T09:32:00.000Z     ISO UTC
--   2026-08-24 15:23:18          naive, no zone
--   2026-08-24T16:00:00+05:30    IST offset
--   0                            epoch, rendering as 01/01/1970
--
-- Every `gt.` / `lt.` filter PostgREST issues against those columns was therefore a
-- STRING comparison. `'2026-08-25T08:00' > '2026-08-25T08:00:00+05:30'` is false because
-- '' < '0', and a `...Z` value sorts after every `+05:30` value of the same wall time
-- because 'Z' > '+'. That single fact produced the availability blocks misfiring, the
-- 1970 rows, `order=created_at.desc` returning rows out of order, and overlap checks
-- that both missed real clashes and invented phantom ones.
--
-- Once these are timestamptz, Postgres compares instants. The whole class of bug becomes
-- impossible rather than merely fixed, and PostgREST casts incoming ISO strings on the
-- way in, so the application keeps working unchanged.
--
-- THE ASYMMETRY THAT MAKES THIS DANGEROUS
-- ---------------------------------------
-- A naive string has no zone, so it can only be interpreted by convention — and the
-- correct convention DIFFERS by column. Getting it wrong shifts data by 5h30m.
--
--   Business datetimes (pickup_at, return_at, starts_at, ends_at, pickup_date,
--   return_date) are wall-clock times a human chose => Asia/Kolkata.
--   Verified: naive and offset values share the same hour distribution, both peaking at
--   hour 08 (90 naive vs 62 offset), matching RENTAL_DAY_START_HOUR = 8. Were the naive
--   values UTC they would represent 13:30 IST, with no reason to cluster there.
--
--   Audit instants (created_at, updated_at, paid_at, ...) are written by server code on
--   Vercel, which runs UTC => UTC.
--   Verified: customers.created_at '2026-08-24 15:23:18' is the same event as
--   bookings.updated_at '2026-08-24T15:23:18.381Z'.
--
-- SCOPE
-- -----
-- Deliberately limited to the columns that drive availability, ordering and money.
-- True date-only columns (date_of_birth, expiry_date, due_date, start_date, end_date)
-- are NOT touched: they are dates, not instants, and converting them would invent a
-- time and a zone. Lower-traffic tables (blog_posts, testimonials, feedback, ...) are a
-- mechanical follow-up with no correctness impact on bookings.

-- ---------------------------------------------------------------------------
-- 1. Converter
-- ---------------------------------------------------------------------------
-- Kept permanently: the backfill scripts and any future import need the same parsing.
CREATE OR REPLACE FUNCTION public.text_to_timestamptz(v text, naive_zone text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  s text := btrim(coalesce(v, ''));
BEGIN
  IF s = '' THEN RETURN NULL; END IF;

  -- '0' is not midnight 1970, it is a missing value that was written as a number.
  -- Four payments.paid_at rows hold it and render as 01/01/1970 in the CRM.
  IF s ~ '^0+$' THEN RETURN NULL; END IF;

  -- Bare integers are epochs. >= 12 digits means milliseconds.
  IF s ~ '^[0-9]+$' THEN
    IF length(s) >= 12 THEN RETURN to_timestamp(s::bigint / 1000.0);
    ELSE RETURN to_timestamp(s::bigint); END IF;
  END IF;

  -- Carries an explicit zone (trailing Z or +/-HH:MM): unambiguous.
  IF s ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' THEN RETURN s::timestamptz; END IF;

  -- Naive: interpret in the caller-supplied zone.
  RETURN (s::timestamp) AT TIME ZONE naive_zone;
EXCEPTION WHEN OTHERS THEN
  -- Never abort a whole-table rewrite over one malformed row; it becomes NULL and is
  -- reported by the verification query in the migration notes.
  RETURN NULL;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Business datetimes -> naive read as Asia/Kolkata
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ALTER COLUMN pickup_at TYPE timestamptz USING public.text_to_timestamptz(pickup_at, 'Asia/Kolkata'),
  ALTER COLUMN return_at TYPE timestamptz USING public.text_to_timestamptz(return_at, 'Asia/Kolkata'),
  ALTER COLUMN actual_pickup_at TYPE timestamptz USING public.text_to_timestamptz(actual_pickup_at, 'Asia/Kolkata'),
  ALTER COLUMN actual_return_at TYPE timestamptz USING public.text_to_timestamptz(actual_return_at, 'Asia/Kolkata');

ALTER TABLE public.availability_blocks
  ALTER COLUMN starts_at TYPE timestamptz USING public.text_to_timestamptz(starts_at, 'Asia/Kolkata'),
  ALTER COLUMN ends_at TYPE timestamptz USING public.text_to_timestamptz(ends_at, 'Asia/Kolkata');

ALTER TABLE public.enquiries
  ALTER COLUMN pickup_date TYPE timestamptz USING public.text_to_timestamptz(pickup_date, 'Asia/Kolkata'),
  ALTER COLUMN return_date TYPE timestamptz USING public.text_to_timestamptz(return_date, 'Asia/Kolkata');

ALTER TABLE public.maintenance_records
  ALTER COLUMN starts_at TYPE timestamptz USING public.text_to_timestamptz(starts_at, 'Asia/Kolkata'),
  ALTER COLUMN ends_at TYPE timestamptz USING public.text_to_timestamptz(ends_at, 'Asia/Kolkata');

-- ---------------------------------------------------------------------------
-- 3. Audit instants -> naive read as UTC
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC'),
  ALTER COLUMN updated_at TYPE timestamptz USING public.text_to_timestamptz(updated_at, 'UTC'),
  ALTER COLUMN terms_accepted_at TYPE timestamptz USING public.text_to_timestamptz(terms_accepted_at, 'UTC');

ALTER TABLE public.payments
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC'),
  ALTER COLUMN paid_at TYPE timestamptz USING public.text_to_timestamptz(paid_at, 'UTC');

ALTER TABLE public.customers
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC'),
  ALTER COLUMN updated_at TYPE timestamptz USING public.text_to_timestamptz(updated_at, 'UTC');

ALTER TABLE public.enquiries
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC'),
  ALTER COLUMN updated_at TYPE timestamptz USING public.text_to_timestamptz(updated_at, 'UTC'),
  ALTER COLUMN submitted_at TYPE timestamptz USING public.text_to_timestamptz(submitted_at, 'UTC');

ALTER TABLE public.booking_history
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC');

ALTER TABLE public.customer_documents
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC');

ALTER TABLE public.availability_blocks
  ALTER COLUMN created_at TYPE timestamptz USING public.text_to_timestamptz(created_at, 'UTC');
