-- ===========================================================================
-- Real vehicle catalogue — Darshan Tours
--
-- SOURCE: the owner's official printed price posters, August 2026.
--         Every rate below is transcribed verbatim from those posters. Do not
--         "correct" a number here without a new poster to back it up.
--
-- RENTAL DAY
--   The rental day runs 08:00 -> 08:00. `rate_24h` is the price for one such
--   day. `weekend_rate_24h` is the Saturday/Sunday price for the same day.
--
-- EARLY PICKUP
--   Collecting a vehicle before 08:00 carries a flat Rs. 250 early-pickup
--   surcharge. This is a booking-time surcharge, not a vehicle attribute, so
--   it is NOT stored in this table.
--
-- LATE DROP
--   A drop after the 08:00 boundary is billed as one additional full day, not
--   pro-rated hourly. `late_fee_per_hour` is therefore deliberately left at 0
--   for every row — using it would double-charge.
--
-- DEPOSITS
--   Deposits are collected in CASH at pickup and refunded in CASH at return.
--   The `deposit` column records the amount to collect at the counter. It MUST
--   NOT be charged through Razorpay or included in any online payment total.
--
-- IDEMPOTENCY
--   Safe to re-run. Upserts are keyed on the UNIQUE `slug` column of each
--   table (vehicle_categories.slug, vehicles.slug), so a re-run refreshes
--   prices in place instead of duplicating rows. Slugs follow the app's
--   slugify(): lowercase, non-alphanumerics stripped, spaces -> hyphens.
--
--   Nothing here deletes or deactivates rows. Existing vehicles may have live
--   bookings against them. See the review query at the bottom of this file.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Categories
--    `kind` is constrained to ('bike','scooter','car','van').
-- ---------------------------------------------------------------------------
INSERT INTO public.vehicle_categories (slug, name, kind, short_desc, active, sort)
VALUES
  ('scooty',          'Scooty',          'scooter', 'Automatic scooters for city and short hill runs', 1, 1),
  ('bike',            'Bike',            'bike',    'Geared motorcycles for highway and ghat rides',    1, 2),
  ('car',             'Car',             'car',     'Self-drive hatchbacks, sedans, MPVs and SUVs',     1, 3),
  ('tempo-traveller', 'Tempo Traveller', 'van',     'Package-priced group travel with driver',          1, 4)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  kind       = EXCLUDED.kind,
  short_desc = EXCLUDED.short_desc,
  active     = EXCLUDED.active,
  sort       = EXCLUDED.sort;

-- ---------------------------------------------------------------------------
-- 2. Two-wheelers — 5 Scooty + 5 Bike
--
--    extra_km_rate = 4, deposit = 1000 for every two-wheeler.
--
--    NOTE: TVS Ronin, CB 200X and Shine genuinely carry the SAME price on
--    weekends as on weekdays — the poster shows one figure for them. The equal
--    weekday/weekend values below are correct and must not be "fixed" by
--    adding a weekend premium.
-- ---------------------------------------------------------------------------
INSERT INTO public.vehicles (
  slug, name, brand, model, category_id, fuel_type, transmission, seats,
  included_km, extra_km_rate, rate_24h, weekend_rate_24h, deposit,
  late_fee_per_hour, active, status
)
SELECT
  v.slug, v.name, v.brand, v.model,
  (SELECT id FROM public.vehicle_categories WHERE slug = v.category_slug),
  'Petrol', 'Automatic', 2,
  v.included_km, 4, v.rate_24h, v.weekend_rate_24h, 1000,
  0, 1, 'available'
FROM (VALUES
  ('dio-scooty',        'Dio Scooty',        'Honda',  'Dio',       'scooty', 100,  900::NUMERIC,  950::NUMERIC),
  ('activa-scooty',     'Activa Scooty',     'Honda',  'Activa',    'scooty', 100,  900::NUMERIC,  950::NUMERIC),
  ('jupiter-scooty',    'Jupiter Scooty',    'TVS',    'Jupiter',   'scooty', 100,  900::NUMERIC,  950::NUMERIC),
  ('yamaha-zr-scooty',  'Yamaha ZR Scooty',  'Yamaha', 'Ray ZR',    'scooty', 100, 1000::NUMERIC, 1100::NUMERIC),
  ('tvs-ntorq-scooty',  'TVS Ntorq Scooty',  'TVS',    'Ntorq 125', 'scooty', 120, 1100::NUMERIC, 1200::NUMERIC)
) AS v(slug, name, brand, model, category_slug, included_km, rate_24h, weekend_rate_24h)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  brand            = EXCLUDED.brand,
  model            = EXCLUDED.model,
  category_id      = EXCLUDED.category_id,
  included_km      = EXCLUDED.included_km,
  extra_km_rate    = EXCLUDED.extra_km_rate,
  rate_24h         = EXCLUDED.rate_24h,
  weekend_rate_24h = EXCLUDED.weekend_rate_24h,
  deposit          = EXCLUDED.deposit,
  active           = 1,
  updated_at       = NOW();

-- Bikes (geared, manual transmission).
INSERT INTO public.vehicles (
  slug, name, brand, model, category_id, fuel_type, transmission, seats,
  included_km, extra_km_rate, rate_24h, weekend_rate_24h, deposit,
  late_fee_per_hour, active, status
)
SELECT
  v.slug, v.name, v.brand, v.model,
  (SELECT id FROM public.vehicle_categories WHERE slug = v.category_slug),
  'Petrol', 'Manual', 2,
  v.included_km, 4, v.rate_24h, v.weekend_rate_24h, 1000,
  0, 1, 'available'
FROM (VALUES
  ('tvs-radar-bike',  'TVS Radar Bike',  'TVS',    'Radar 125', 'bike', 160, 1400::NUMERIC, 1500::NUMERIC),
  ('pulsar-ns-bike',  'Pulsar NS Bike',  'Bajaj',  'Pulsar NS', 'bike', 160, 1300::NUMERIC, 1400::NUMERIC),
  -- weekend == weekday, per poster:
  ('tvs-ronin-bike',  'TVS Ronin Bike',  'TVS',    'Ronin 225', 'bike', 200, 1800::NUMERIC, 1800::NUMERIC),
  ('cb-200x-bike',    'CB 200X Bike',    'Honda',  'CB 200X',   'bike', 200, 1800::NUMERIC, 1800::NUMERIC),
  ('shine-bike',      'Shine Bike',      'Honda',  'Shine',     'bike', 100, 1000::NUMERIC, 1000::NUMERIC)
) AS v(slug, name, brand, model, category_slug, included_km, rate_24h, weekend_rate_24h)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  brand            = EXCLUDED.brand,
  model            = EXCLUDED.model,
  category_id      = EXCLUDED.category_id,
  transmission     = EXCLUDED.transmission,
  included_km      = EXCLUDED.included_km,
  extra_km_rate    = EXCLUDED.extra_km_rate,
  rate_24h         = EXCLUDED.rate_24h,
  weekend_rate_24h = EXCLUDED.weekend_rate_24h,
  deposit          = EXCLUDED.deposit,
  active           = 1,
  updated_at       = NOW();

-- ---------------------------------------------------------------------------
-- 3. Cars — 6 rows
--
--    extra_km_rate = 8, deposit = 2000, included_km = 300 for every car.
--
--    NOTE: the car poster's single price list is the WEEKDAY rate. Owner
--    confirmed separately: cars carry a flat Rs. 50 weekend premium (Sat/Sun),
--    same rule as most of the two-wheelers. weekend_rate_24h = rate_24h + 50.
-- ---------------------------------------------------------------------------
INSERT INTO public.vehicles (
  slug, name, brand, model, category_id, fuel_type, transmission, seats,
  included_km, extra_km_rate, rate_24h, weekend_rate_24h, deposit,
  late_fee_per_hour, active, status
)
SELECT
  v.slug, v.name, v.brand, v.model,
  (SELECT id FROM public.vehicle_categories WHERE slug = 'car'),
  'Petrol', v.transmission, v.seats,
  300, 8, v.rate_24h, v.rate_24h + 50, 2000,
  0, 1, 'available'
FROM (VALUES
  ('balleno-manual-car',      'Balleno Manual Car',      'Maruti Suzuki', 'Baleno',  'Manual',    5, 3500::NUMERIC),
  ('balleno-automatic-car',   'Balleno Automatic Car',   'Maruti Suzuki', 'Baleno',  'Automatic', 5, 3600::NUMERIC),
  ('maruti-dzire',            'Maruti Dzire',            'Maruti Suzuki', 'Dzire',   'Manual',    5, 3500::NUMERIC),
  ('maruti-ciaz',             'Maruti Ciaz',             'Maruti Suzuki', 'Ciaz',    'Manual',    5, 4000::NUMERIC),
  ('maruti-ertiga-7-seater',  'Maruti Ertiga 7 Seater',  'Maruti Suzuki', 'Ertiga',  'Manual',    7, 4500::NUMERIC),
  ('mahindra-thar',           'Mahindra Thar',           'Mahindra',      'Thar',    'Manual',    4, 5000::NUMERIC)
) AS v(slug, name, brand, model, transmission, seats, rate_24h)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  brand            = EXCLUDED.brand,
  model            = EXCLUDED.model,
  category_id      = EXCLUDED.category_id,
  transmission     = EXCLUDED.transmission,
  seats            = EXCLUDED.seats,
  included_km      = EXCLUDED.included_km,
  extra_km_rate    = EXCLUDED.extra_km_rate,
  rate_24h         = EXCLUDED.rate_24h,
  weekend_rate_24h = EXCLUDED.weekend_rate_24h,
  deposit          = EXCLUDED.deposit,
  active           = 1,
  updated_at       = NOW();

-- ---------------------------------------------------------------------------
-- 4. Tempo Traveller — 1 row
--
--    WARNING: the Tempo Traveller is PACKAGE priced, not per-day-per-km. It
--    does not fit the `vehicles` table cleanly. The row below encodes only the
--    first package (Rs. 12000) as a day rate so the vehicle is bookable and
--    visible; the km/extra-km columns are placeholders and should not be
--    quoted to a customer without checking the poster.
-- ---------------------------------------------------------------------------
INSERT INTO public.vehicles (
  slug, name, brand, model, category_id, fuel_type, transmission, seats,
  included_km, extra_km_rate, rate_24h, weekend_rate_24h, deposit,
  late_fee_per_hour, active, status
)
SELECT
  'tempo-traveller', 'Tempo Traveller', 'Force', 'Traveller',
  (SELECT id FROM public.vehicle_categories WHERE slug = 'tempo-traveller'),
  'Diesel', 'Manual', 12,
  300, 8, 12000, 12000, 2000,
  0, 1, 'available'
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  brand            = EXCLUDED.brand,
  model            = EXCLUDED.model,
  category_id      = EXCLUDED.category_id,
  seats            = EXCLUDED.seats,
  included_km      = EXCLUDED.included_km,
  extra_km_rate    = EXCLUDED.extra_km_rate,
  rate_24h         = EXCLUDED.rate_24h,
  weekend_rate_24h = EXCLUDED.weekend_rate_24h,
  deposit          = EXCLUDED.deposit,
  active           = 1,
  updated_at       = NOW();

-- ===========================================================================
-- NOT REPRESENTABLE IN THE CURRENT SCHEMA — needs a decision
--
-- The Tempo Traveller poster lists TWO packages:
--
--   Package 1  (encoded above as the day rate)      Rs. 12000
--   Package 2  Sakleshpura + Chikmagalur, 2 days    Rs. 18000
--
-- Package 2 is a fixed-price, fixed-duration, fixed-itinerary product. The
-- `vehicles` table has no field for it:
--   * rate_24h x 2 gives Rs. 24000, not Rs. 18000, so it cannot be derived.
--   * There is exactly one rate_24h per vehicle, so a second package cannot
--     live on the same row.
--   * Creating a second fake vehicle row would corrupt availability and
--     inventory counts for a single physical van.
--
-- Two viable options, BOTH requiring a schema decision by the owner/dev — no
-- schema is invented here:
--
--   (a) A new `packages` table: (slug, name, vehicle_id, days, itinerary,
--       price, inclusions, active) with its own booking path.
--   (b) A `pricing_rules` row scoped to this vehicle. The existing
--       `pricing_rules` table already has vehicle_id, min_days, rate_24h and
--       priority — a rule with min_days = 2 and rate_24h = 9000 would total
--       Rs. 18000 for a 2-day hire. But `day_type` is CHECK-constrained to
--       ('weekend','long_weekend','holiday','festival','peak','off_season')
--       with no 'package' value, and start_date/end_date are NOT NULL, so it
--       still needs a constraint change plus a sentinel date range. It also
--       cannot express the fixed itinerary.
--
-- Until one of these lands, Package 2 must be quoted manually. DO NOT let the
-- online booking flow price a 2-day Tempo Traveller hire automatically.
-- ===========================================================================

COMMIT;

-- ===========================================================================
-- REVIEW QUERY — not executed by this migration.
--
-- This migration deliberately deletes and deactivates nothing: rows outside
-- this catalogue may still carry live bookings. Run the SELECT below by hand
-- to list every vehicle NOT in the poster catalogue, then decide row by row
-- whether to set active = 0.
--
-- SELECT v.id, v.slug, v.name, v.status, v.active, v.rate_24h,
--        (SELECT COUNT(*) FROM public.bookings b WHERE b.vehicle_id = v.id) AS booking_count
--   FROM public.vehicles v
--  WHERE v.slug NOT IN (
--          'dio-scooty', 'activa-scooty', 'jupiter-scooty', 'yamaha-zr-scooty',
--          'tvs-ntorq-scooty',
--          'tvs-radar-bike', 'pulsar-ns-bike', 'tvs-ronin-bike', 'cb-200x-bike',
--          'shine-bike',
--          'balleno-manual-car', 'balleno-automatic-car', 'maruti-dzire',
--          'maruti-ciaz', 'maruti-ertiga-7-seater', 'mahindra-thar',
--          'tempo-traveller'
--        )
--  ORDER BY booking_count DESC, v.name;
--
-- Rows with booking_count = 0 are safe to deactivate:
--   UPDATE public.vehicles SET active = 0, status = 'archived', updated_at = NOW()
--    WHERE slug = '<slug>';
-- ===========================================================================
