-- Soft-deleted units must stop reserving their identifier.
--
-- uq_vehicle_unit_identifier was UNIQUE on (vehicle_id, unit_identifier) with no
-- predicate, so a unit removed from a vehicle kept owning its name forever. Raising a
-- vehicle's unit count then regenerated that same default identifier, the INSERT hit
-- the unique violation, and saveVehicle discarded the error — total_units saved as the
-- new number while no unit row appeared. That is why raising the quantity in the CRM
-- "did nothing" and the availability badge never moved.
--
-- Scope, measured before writing this: 52 soft-deleted rows across 20 vehicles were
-- holding identifiers hostage. Honda Dio alone had HONDAD-002..005 buried at active=0,
-- which is why its second unit could never be created.
--
-- Uniqueness among ACTIVE units is the invariant that actually matters — two live
-- units of one vehicle must not share an identifier. Retired rows are history and
-- should constrain nothing.
--
-- Verified before applying: zero (vehicle_id, unit_identifier) duplicates exist among
-- active rows, so the partial index builds without conflict.

BEGIN;

-- Backed by a table CONSTRAINT, so the constraint (not the index) is what must go.
ALTER TABLE public.vehicle_units DROP CONSTRAINT IF EXISTS uq_vehicle_unit_identifier;
DROP INDEX IF EXISTS public.uq_vehicle_unit_identifier;

CREATE UNIQUE INDEX uq_vehicle_unit_identifier_active
  ON public.vehicle_units (vehicle_id, unit_identifier)
  WHERE active = 1;

COMMIT;
