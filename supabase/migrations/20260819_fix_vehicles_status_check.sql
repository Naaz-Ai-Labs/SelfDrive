-- ===========================================================================
-- Fix vehicles and vehicle_units status check constraints
-- Resolves error: "new row for relation vehicles violates check constraint vehicles_status_check"
-- Allows: 'available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived'
-- ===========================================================================

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN ('available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived'));

ALTER TABLE public.vehicle_units DROP CONSTRAINT IF EXISTS vehicle_units_status_check;
ALTER TABLE public.vehicle_units
  ADD CONSTRAINT vehicle_units_status_check
  CHECK (status IN ('available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived'));
