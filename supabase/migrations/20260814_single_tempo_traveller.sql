-- One bookable Tempo Traveller, not two.
--
-- The catalogue held two rows: "Sakleshpura Sightseeing" and "Sakleshpura &
-- Chikmagalur (2 Days)". They are the same physical van, so listing both let the
-- one vehicle be booked twice for the same dates — and the owner's unit count says
-- Tempo Traveller: 1.
--
-- The poster prices the day rate at Rs.12000 and the two-day Chikmagalur plan at
-- Rs.18000. Rs.18000 is not 2 x Rs.12000, so the package cannot be expressed as a
-- day rate; the owner confirmed staff apply it as a manual adjustment on the
-- booking instead. The package row is therefore deactivated rather than deleted —
-- it may carry history, and an inactive vehicle is invisible to customers.
--
-- The surviving row is normalised to the poster: Rs.12000/day, 300 km, Rs.8/km
-- extra, Rs.2000 deposit, +Rs.50 at weekends like every other four-wheeler. Its
-- included_km had drifted to 999, which reads as "unlimited" and would have
-- silently waived extra-km billing.
--
-- Idempotent: safe to re-run.

BEGIN;

UPDATE public.vehicles
   SET active = 0, status = 'archived', updated_at = NOW()
 WHERE name ILIKE '%Chikmagalur%'
   AND category_id = (SELECT id FROM public.vehicle_categories WHERE slug = 'tempo-traveller');

UPDATE public.vehicles
   SET name             = 'Tempo Traveller',
       rate_24h         = 12000,
       weekend_rate_24h = 12050,
       included_km      = 300,
       extra_km_rate    = 8,
       deposit          = 2000,
       total_units      = 1,
       active           = 1,
       updated_at       = NOW()
 WHERE category_id = (SELECT id FROM public.vehicle_categories WHERE slug = 'tempo-traveller')
   AND active = 1;

COMMIT;

-- Expect exactly one active row here after running.
-- SELECT name, rate_24h, weekend_rate_24h, included_km, deposit, total_units
--   FROM public.vehicles
--  WHERE active = 1
--    AND category_id = (SELECT id FROM public.vehicle_categories WHERE slug = 'tempo-traveller');
