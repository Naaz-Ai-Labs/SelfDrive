-- Round 3: GPS capture at vehicle handover/return.
--
-- Records where the staff member actually was when they recorded the inspection
-- (browser/device geolocation, captured client-side at the moment of check-in or
-- check-out) — not the vehicle's live location, and not tracking. This is a
-- one-time position stamp per inspection, same idea as a delivery app's
-- "delivered from this location" record.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS geo_lat NUMERIC(9, 6);
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS geo_lng NUMERIC(9, 6);
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS geo_accuracy_m NUMERIC(8, 2);

COMMENT ON COLUMN public.inspections.geo_lat IS
  'Latitude captured from the staff device at the moment of handover/return inspection. Null if geolocation was denied or unavailable — never block the inspection on this.';
COMMENT ON COLUMN public.inspections.geo_lng IS
  'Longitude, paired with geo_lat.';
COMMENT ON COLUMN public.inspections.geo_accuracy_m IS
  'Browser-reported accuracy radius in metres (Geolocation API `coords.accuracy`). Large values (>100m) mean the reading is coarse (e.g. no GPS lock, wifi/cell-tower only) — display accordingly, do not treat as precise.';
