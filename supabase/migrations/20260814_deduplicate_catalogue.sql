-- Reconciles the vehicle catalogue to the owner's printed posters, exactly.
--
-- SOURCE OF TRUTH
--   The two price posters (bikes/scooties, cars/tempo) plus the owner's unit
--   counts. Sixteen vehicles, four categories. Nothing else may be bookable.
--
-- WHAT WENT WRONG BEFORE
--   20260813_real_vehicle_catalogue.sql upserted ON CONFLICT (slug) using slugs
--   taken from the posters ('car', 'scooty', 'balleno-manual-car', ...). The
--   database already held the same products under different slugs ('cars',
--   'scooters', 'maruti-baleno-manual', ...), so nothing conflicted and every row
--   was INSERTED. The result was a complete second catalogue with no images.
--
-- APPROACH
--   Keep the ORIGINAL rows: they carry the photos, the real unit counts and the
--   existing bookings. Correct their pricing to the poster, then remove the
--   duplicates. Verified before writing: the duplicate rows have zero bookings;
--   the originals (Dio, Jupiter, RayZR, Shine) have six between them.
--
--   Deletes are guarded with NOT EXISTS on bookings, so this cannot destroy
--   history even if the data has moved since. Anything unrecognised is
--   DEACTIVATED, never deleted.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Two-wheelers — poster rates, 4/km extra, Rs.1000 deposit.
--    'TVS Raider' in the database is the poster's 'TVS Radar Bike' (owner
--    confirmed). 'Yamaha RayZR' is the poster's 'Yamaha ZR Scooty'.
--    Ronin, CB200X and Shine genuinely cost the same at weekends.
-- ---------------------------------------------------------------------------
UPDATE public.vehicles v SET
  rate_24h = p.wd, weekend_rate_24h = p.we, included_km = p.km,
  extra_km_rate = 4, deposit = 1000, total_units = p.units,
  active = 1, updated_at = NOW()
FROM (VALUES
  --  slug                 weekday  weekend    km  units
  ('honda-dio-1',            900,           950,          100, 4),
  ('honda-activa-6g-2',      900,           950,          100, 2),
  ('tvs-jupiter',            900,           950,          100, 6),
  ('yamaha-rayzr',          1000,          1100,          100, 2),
  ('tvs-ntorq',             1100,          1200,          120, 3),
  ('tvs-raider',            1400,          1500,          160, 2),
  ('bajaj-pulsar-ns',       1300,          1400,          160, 1),
  ('tvs-ronin',             1800,          1800,          200, 1),
  ('honda-cb200x',          1800,          1800,          200, 1),
  ('honda-shine',           1000,          1000,          100, 2)
) AS p(slug, wd, we, km, units)
WHERE v.slug = p.slug;

-- ---------------------------------------------------------------------------
-- 2. Cars — poster rates, 300 km, 8/km extra, Rs.2000 deposit, +Rs.50 weekend.
--
--    Baleno: the poster lists Manual (3500) and Automatic (3600) separately, but
--    the owner asked for ONE Baleno entry with 2 units — staff allocate manual or
--    automatic at handover. Priced at the 3500 manual rate.
-- ---------------------------------------------------------------------------
UPDATE public.vehicles v SET
  rate_24h = p.wd, weekend_rate_24h = p.wd + 50, included_km = 300,
  extra_km_rate = 8, deposit = 2000, total_units = p.units,
  active = 1, updated_at = NOW()
FROM (VALUES
  ('maruti-baleno-manual',    3500,          2),
  ('maruti-dzire',            3500,          1),
  ('maruti-ciaz',             4000,          1),
  ('maruti-ertiga-7-seater',  4500,          1),
  ('mahindra-thar-manual',    5000,          1)
) AS p(slug, wd, units)
WHERE v.slug = p.slug;

-- Name the surviving Baleno plainly, since it now covers both transmissions.
UPDATE public.vehicles SET name = 'Maruti Baleno', transmission = 'Manual'
 WHERE slug = 'maruti-baleno-manual';

-- ---------------------------------------------------------------------------
-- 3. Cars that the bad migration filed under its own category go back to "Cars".
-- ---------------------------------------------------------------------------
UPDATE public.vehicles
   SET category_id = (SELECT id FROM public.vehicle_categories WHERE slug = 'cars'),
       updated_at = NOW()
 WHERE slug IN ('maruti-dzire', 'maruti-ciaz', 'maruti-ertiga-7-seater');

-- ---------------------------------------------------------------------------
-- 4. Tempo Traveller — Rs.12000/day, 1 unit. Created only if absent, so a
--    re-run cannot produce a second one.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cat BIGINT;
  v_id  BIGINT;
BEGIN
  SELECT id INTO v_cat FROM public.vehicle_categories WHERE slug = 'tempo-traveller';
  IF v_cat IS NULL THEN RETURN; END IF;

  SELECT id INTO v_id FROM public.vehicles WHERE category_id = v_cat ORDER BY id LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.vehicles (slug, name, brand, model, category_id, fuel_type,
      transmission, seats, included_km, extra_km_rate, rate_24h, weekend_rate_24h,
      deposit, total_units, active, status)
    VALUES ('tempo-traveller-12', 'Tempo Traveller', 'Force', 'Traveller', v_cat,
      'Diesel', 'Manual', 12, 300, 8, 12000, 12000, 2000, 1, 1, 'available');
  ELSE
    UPDATE public.vehicles
       SET rate_24h = 12000, weekend_rate_24h = 12000, included_km = 300,
           extra_km_rate = 8, deposit = 2000, total_units = 1, active = 1,
           updated_at = NOW()
     WHERE id = v_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Remove the duplicate vehicles. Guarded on bookings.
-- ---------------------------------------------------------------------------
DELETE FROM public.vehicle_photos
 WHERE vehicle_id IN (SELECT id FROM public.vehicles WHERE slug IN (
   'dio-scooty','activa-scooty','jupiter-scooty','yamaha-zr-scooty','tvs-ntorq-scooty',
   'tvs-radar-bike','pulsar-ns-bike','tvs-ronin-bike','cb-200x-bike','shine-bike',
   'balleno-manual-car','balleno-automatic-car','mahindra-thar','tempo-traveller'));

DELETE FROM public.vehicles v
 WHERE v.slug IN (
   'dio-scooty','activa-scooty','jupiter-scooty','yamaha-zr-scooty','tvs-ntorq-scooty',
   'tvs-radar-bike','pulsar-ns-bike','tvs-ronin-bike','cb-200x-bike','shine-bike',
   'balleno-manual-car','balleno-automatic-car','mahindra-thar','tempo-traveller')
   AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.vehicle_id = v.id);

-- ---------------------------------------------------------------------------
-- 6. Drop the duplicate categories once empty.
-- ---------------------------------------------------------------------------
DELETE FROM public.vehicle_categories c
 WHERE c.slug IN ('scooty', 'bike', 'car')
   AND NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.category_id = c.id);

-- ---------------------------------------------------------------------------
-- 7. Hide everything that is not on the posters — test rows and anything else.
--    Deactivated, not deleted: test bookings stay inspectable, customers see
--    nothing. This is what enforces "only these vehicles exist".
-- ---------------------------------------------------------------------------
UPDATE public.vehicles
   SET active = 0, status = 'archived', updated_at = NOW()
 WHERE slug NOT IN (
   'honda-dio-1','honda-activa-6g-2','tvs-jupiter','yamaha-rayzr','tvs-ntorq',
   'tvs-raider','bajaj-pulsar-ns','tvs-ronin','honda-cb200x','honda-shine',
   'maruti-baleno-manual','maruti-dzire','maruti-ciaz','maruti-ertiga-7-seater',
   'mahindra-thar-manual','tempo-traveller-12')
   AND category_id <> (SELECT id FROM public.vehicle_categories WHERE slug = 'tempo-traveller');

COMMIT;

-- ===========================================================================
-- EXPECTED AFTER RUNNING: 4 categories, 16 active vehicles.
--
-- SELECT c.name AS category, COUNT(v.id) FILTER (WHERE v.active = 1) AS active
--   FROM public.vehicle_categories c
--   LEFT JOIN public.vehicles v ON v.category_id = c.id
--  GROUP BY c.id, c.name ORDER BY c.sort;
--
-- SELECT name, rate_24h, weekend_rate_24h, included_km, deposit, total_units
--   FROM public.vehicles WHERE active = 1 ORDER BY category_id, rate_24h;
-- ===========================================================================
