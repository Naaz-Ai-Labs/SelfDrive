-- Two-wheelers were recorded as 5-seaters.
--
-- Cause: crm/src/components/dashboard/VehicleForm.tsx defaulted a NEW vehicle's seat
-- count to "5" regardless of the category chosen, so every scooter and bike added
-- through the CRM inherited it. Twelve vehicles (ids 231-242, the recently added
-- batch) carried seats = 5; the originally seeded two-wheelers all correctly carry 2.
-- The form now seeds seats from the selected category instead, so this cannot recur.
--
-- Scope is deliberately limited to bikes and scooters.
--
-- Cars are NOT touched. Four of the six are already 5, and the other two are correct
-- as they stand:
--   id 15  Maruti Ertiga 7 Seater  seats 7  — the name states it
--   id 16  Mahindra Thar           seats 4  — correct for the variant
-- A blanket "all cars = 5" would have corrupted both while changing nothing that was
-- wrong. Vans (Tempo Traveller, 12) are likewise untouched.

BEGIN;

UPDATE public.vehicles v
   SET seats = 2,
       updated_at = NOW()
  FROM public.vehicle_categories c
 WHERE c.id = v.category_id
   AND c.kind IN ('bike', 'scooter')
   AND v.seats IS DISTINCT FROM 2;

COMMIT;
