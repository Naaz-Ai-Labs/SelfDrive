-- Phase 1 Migration: Physical Vehicle Units, Dynamic Branch Allocations,
-- Branch Transfers Audit Trail, and Idempotency Keys.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Physical Vehicle Units Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_units (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  unit_identifier TEXT NOT NULL,
  registration_no TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'maintenance', 'blocked', 'transit', 'inactive')),
  current_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_vehicle_unit_identifier UNIQUE (vehicle_id, unit_identifier)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_units_vehicle ON public.vehicle_units (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_branch ON public.vehicle_units (current_branch_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_status ON public.vehicle_units (status);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_active ON public.vehicle_units (active);

-- ---------------------------------------------------------------------------
-- 2. Period-Based Branch Allocations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_allocations (
  id BIGSERIAL PRIMARY KEY,
  vehicle_unit_id BIGINT NOT NULL REFERENCES public.vehicle_units(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ, -- NULL means ongoing indefinitely
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_allocations_unit ON public.branch_allocations (vehicle_unit_id);
CREATE INDEX IF NOT EXISTS idx_branch_allocations_branch ON public.branch_allocations (branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_allocations_dates ON public.branch_allocations (starts_at, ends_at);

-- Trigger to prevent overlapping allocations for the same physical vehicle unit
CREATE OR REPLACE FUNCTION public.prevent_overlapping_branch_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_overlap_count INTEGER;
BEGIN
  -- Check for any overlapping allocation for the same physical unit
  SELECT COUNT(*) INTO v_overlap_count
    FROM public.branch_allocations
   WHERE vehicle_unit_id = NEW.vehicle_unit_id
     AND id IS DISTINCT FROM NEW.id
     AND (ends_at IS NULL OR ends_at > NEW.starts_at)
     AND (NEW.ends_at IS NULL OR starts_at < NEW.ends_at);

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Branch allocation overlap detected for vehicle unit % (starts: %, ends: %)',
      NEW.vehicle_unit_id, NEW.starts_at, NEW.ends_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_overlapping_allocations ON public.branch_allocations;
CREATE TRIGGER trg_prevent_overlapping_allocations
  BEFORE INSERT OR UPDATE ON public.branch_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_overlapping_branch_allocations();

-- ---------------------------------------------------------------------------
-- 3. Branch Transfers Audit Trail Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id BIGSERIAL PRIMARY KEY,
  vehicle_unit_id BIGINT NOT NULL REFERENCES public.vehicle_units(id) ON DELETE CASCADE,
  from_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  performed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_transfers_unit ON public.branch_transfers (vehicle_unit_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_dates ON public.branch_transfers (effective_date);

-- ---------------------------------------------------------------------------
-- 4. Idempotency Keys Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_json TEXT,
  status_code INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON public.idempotency_keys (key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public.idempotency_keys (expires_at);

-- ---------------------------------------------------------------------------
-- 5. Extend Bookings & Availability Blocks with Physical Unit References
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vehicle_unit_id BIGINT REFERENCES public.vehicle_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_unit
  ON public.bookings (vehicle_unit_id);

ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS vehicle_unit_id BIGINT REFERENCES public.vehicle_units(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_availability_blocks_vehicle_unit
  ON public.availability_blocks (vehicle_unit_id);

-- ---------------------------------------------------------------------------
-- 6. Safe Backfill for Existing Vehicles to Physical Units
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_veh RECORD;
  v_i INTEGER;
  v_prefix TEXT;
  v_unit_id BIGINT;
  v_unit_ident TEXT;
  v_branch_id BIGINT;
  v_default_branch BIGINT;
BEGIN
  -- Get fallback default branch if vehicle branch is null
  SELECT id INTO v_default_branch FROM public.branches WHERE active = 1 ORDER BY id LIMIT 1;

  FOR v_veh IN SELECT * FROM public.vehicles LOOP
    v_prefix := UPPER(SUBSTRING(REGEXP_REPLACE(v_veh.slug, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 6));
    IF v_prefix IS NULL OR v_prefix = '' THEN
      v_prefix := 'UNIT';
    END IF;

    v_branch_id := COALESCE(v_veh.branch_id, v_default_branch);

    -- Only backfill if no units currently exist for this vehicle
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_units WHERE vehicle_id = v_veh.id) THEN
      FOR v_i IN 1..GREATEST(1, COALESCE(v_veh.total_units, 1)) LOOP
        v_unit_ident := format('%s-%s', v_prefix, LPAD(v_i::TEXT, 3, '0'));

        INSERT INTO public.vehicle_units (
          vehicle_id,
          unit_identifier,
          registration_no,
          status,
          current_branch_id,
          active,
          created_at
        ) VALUES (
          v_veh.id,
          v_unit_ident,
          CASE WHEN v_i = 1 THEN v_veh.registration_no ELSE NULL END,
          COALESCE(v_veh.status, 'available'),
          v_branch_id,
          COALESCE(v_veh.active, 1),
          NOW()
        ) RETURNING id INTO v_unit_id;

        -- Create initial ongoing branch allocation if branch exists
        IF v_branch_id IS NOT NULL THEN
          INSERT INTO public.branch_allocations (
            vehicle_unit_id,
            branch_id,
            starts_at,
            ends_at,
            notes
          ) VALUES (
            v_unit_id,
            v_branch_id,
            COALESCE(v_veh.created_at, NOW() - INTERVAL '1 year'),
            NULL,
            'Initial backfilled allocation'
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
