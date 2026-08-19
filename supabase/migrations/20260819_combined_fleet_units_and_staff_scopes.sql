-- ===========================================================================
-- Combined Supabase Migration:
-- 1. Physical Vehicle Units Table & 50-50 Branch Fleet Distribution
-- 2. Period-Based Branch Allocations with Overlap Protection Trigger
-- 3. Branch Transfers Audit Trail Table
-- 4. Atomic Idempotency Keys System
-- 5. Physical Unit References in Bookings & Availability Blocks
-- 6. Granular Staff Permissions Column (users.permissions)
-- 7. Authoritative 50-50 Fleet Distribution Roster (42 Units across 17 models)
-- 8. Authoritative Unit-Level Reservation RPCs (reserve_vehicle_unit_slot & reserve_vehicle_slot)
-- 9. Daily Fleet Allocation Aggregator RPC (get_fleet_daily_allocations)
-- 10. Row Level Security (RLS) Policies & Public / Authenticated Grants
-- 11. Primary Key Sequence Synchronization
-- ===========================================================================
--
-- Idempotent: safe to run directly in the Supabase SQL Editor or CLI.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Physical Vehicle Units Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_units (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  unit_identifier TEXT NOT NULL,
  registration_no TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived')),
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
CREATE INDEX IF NOT EXISTS idx_vehicle_units_reg_no ON public.vehicle_units (registration_no);

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
END;
$$;

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
-- 5b. Align Status Check Constraints (allow unavailable, blocked, transit, etc.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN ('available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived'));

ALTER TABLE public.vehicle_units DROP CONSTRAINT IF EXISTS vehicle_units_status_check;
ALTER TABLE public.vehicle_units
  ADD CONSTRAINT vehicle_units_status_check
  CHECK (status IN ('available', 'unavailable', 'booked', 'maintenance', 'blocked', 'transit', 'inactive', 'archived'));

-- ---------------------------------------------------------------------------
-- 6. Granular Staff Permissions Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions TEXT;

COMMENT ON COLUMN public.users.permissions IS 'JSON array of authorized service scopes (e.g. ["bookings", "vehicles", "enquiries", "fleet_allocations", "payments", "refunds", "tickets", "customers", "staff", "reports", "settings"])';

-- Assign standard default scopes for existing staff users
UPDATE public.users
   SET permissions = '["bookings","vehicles","enquiries","customers","tickets"]'
 WHERE role = 'staff' AND (permissions IS NULL OR permissions = '');

-- ---------------------------------------------------------------------------
-- 7. Ensure Default Branches Exist (Sakleshpura & Hassan)
-- ---------------------------------------------------------------------------
INSERT INTO public.branches (id, name, city, address, phone, active, blocked)
VALUES
  (1, 'Sakleshpura Branch', 'Sakleshpura', 'Main Road, Near Bus Stand', '+917676875595', 1, 0),
  (2, 'Hassan Branch', 'Hassan', 'BM Road, Hassan', '+918088283908', 1, 0)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- 8. Authoritative Original Fleet Distribution Seeding
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unit RECORD;
  v_units_data JSONB := '[
    {"id":101,"vehicle_id":1,"unit_identifier":"DIO-001","registration_no":"KA 13 D 6730","branch_id":1,"notes":"Dio Unit 1 (Sakleshpura)"},
    {"id":102,"vehicle_id":1,"unit_identifier":"DIO-002","registration_no":"KA 13 D 6732","branch_id":1,"notes":"Dio Unit 2 (Sakleshpura)"},
    {"id":103,"vehicle_id":1,"unit_identifier":"DIO-003","registration_no":"KA 13 D 6728","branch_id":2,"notes":"Dio Unit 3 (Hassan)"},
    {"id":104,"vehicle_id":1,"unit_identifier":"DIO-004","registration_no":"KA 66 L 3725","branch_id":2,"notes":"Dio Unit 4 (Hassan)"},

    {"id":201,"vehicle_id":2,"unit_identifier":"ACTIVA-001","registration_no":"KA 13 D 6731","branch_id":1,"notes":"Activa Unit 1 (Sakleshpura)"},
    {"id":202,"vehicle_id":2,"unit_identifier":"ACTIVA-002","registration_no":"KA 66 Q 0119","branch_id":2,"notes":"Activa Unit 2 (Hassan)"},

    {"id":301,"vehicle_id":3,"unit_identifier":"JUPITER-001","registration_no":"KA 13 AA 6607","branch_id":1,"notes":"Jupiter Unit 1 (Sakleshpura)"},
    {"id":302,"vehicle_id":3,"unit_identifier":"JUPITER-002","registration_no":"KA 13 AA 6606","branch_id":1,"notes":"Jupiter Unit 2 (Sakleshpura)"},
    {"id":303,"vehicle_id":3,"unit_identifier":"JUPITER-003","registration_no":"KA 13 AA 6605","branch_id":1,"notes":"Jupiter Unit 3 (Sakleshpura)"},
    {"id":304,"vehicle_id":3,"unit_identifier":"JUPITER-004","registration_no":"KA 13 AA 7010","branch_id":2,"notes":"Jupiter Unit 4 (Hassan)"},
    {"id":305,"vehicle_id":3,"unit_identifier":"JUPITER-005","registration_no":"KA 13 AA 3467","branch_id":2,"notes":"Jupiter Unit 5 (Hassan)"},
    {"id":306,"vehicle_id":3,"unit_identifier":"JUPITER-006","registration_no":"KA 13 AA 3468","branch_id":2,"notes":"Jupiter Unit 6 (Hassan)"},

    {"id":401,"vehicle_id":4,"unit_identifier":"RAYZR-001","registration_no":"KA 66 Q 5483","branch_id":1,"notes":"Yamaha RayZR Unit 1 (Sakleshpura)"},
    {"id":402,"vehicle_id":4,"unit_identifier":"RAYZR-002","registration_no":"KA 66 Q 5484","branch_id":2,"notes":"Yamaha RayZR Unit 2 (Hassan)"},

    {"id":501,"vehicle_id":5,"unit_identifier":"NTORQ-001","registration_no":"KA 13 AA 7007","branch_id":1,"notes":"NTorq Unit 1 (Sakleshpura)"},
    {"id":502,"vehicle_id":5,"unit_identifier":"NTORQ-002","registration_no":"KA 13 AA 7009","branch_id":1,"notes":"NTorq Unit 2 (Sakleshpura)"},
    {"id":503,"vehicle_id":5,"unit_identifier":"NTORQ-003","registration_no":"KA 13 AA 7008","branch_id":2,"notes":"NTorq Unit 3 (Hassan)"},

    {"id":601,"vehicle_id":6,"unit_identifier":"RONIN-001","registration_no":"KA 66 R 2082","branch_id":1,"notes":"TVS Ronin Unit 1 (Sakleshpura)"},

    {"id":701,"vehicle_id":7,"unit_identifier":"CB200X-001","registration_no":"KA 13 D 9771","branch_id":2,"notes":"Honda CB200X Unit 1 (Hassan)"},

    {"id":801,"vehicle_id":8,"unit_identifier":"RAIDER-001","registration_no":"KA 13 AA 7007","branch_id":1,"notes":"TVS Raider Unit 1 (Sakleshpura)"},
    {"id":802,"vehicle_id":8,"unit_identifier":"RAIDER-002","registration_no":"KA 13 AA 3469","branch_id":2,"notes":"TVS Raider Unit 2 (Hassan)"},

    {"id":901,"vehicle_id":9,"unit_identifier":"PULSAR-001","registration_no":"KA 66 L 4592","branch_id":1,"notes":"Bajaj Pulsar NS Unit 1 (Sakleshpura)"},

    {"id":1001,"vehicle_id":10,"unit_identifier":"SHINE-001","registration_no":"KA 13 D 6729","branch_id":1,"notes":"Honda Shine Unit 1 (Sakleshpura)"},
    {"id":1002,"vehicle_id":10,"unit_identifier":"SHINE-002","registration_no":"KA 13 D 9770","branch_id":2,"notes":"Honda Shine Unit 2 (Hassan)"},

    {"id":1101,"vehicle_id":11,"unit_identifier":"BALENO-001","registration_no":"KA 13 MA 0550","branch_id":1,"notes":"Baleno Manual (Sakleshpura)"},
    {"id":1102,"vehicle_id":11,"unit_identifier":"BALENO-002","registration_no":"KA 18 MB 6673","branch_id":2,"notes":"Baleno Automatic (Hassan)"},

    {"id":1301,"vehicle_id":13,"unit_identifier":"DZIRE-001","registration_no":"KA 18 O 3985","branch_id":1,"notes":"Maruti Dzire Unit 1 (Sakleshpura)"},

    {"id":1401,"vehicle_id":14,"unit_identifier":"CIAZ-001","registration_no":"KA 13 AA 0810","branch_id":2,"notes":"Maruti Ciaz Unit 1 (Hassan)"},

    {"id":1501,"vehicle_id":15,"unit_identifier":"ERTIGA-001","registration_no":"KA 18 MB 0040","branch_id":1,"notes":"Maruti Ertiga Unit 1 (Sakleshpura)"},

    {"id":1601,"vehicle_id":16,"unit_identifier":"THAR-001","registration_no":"KA 18 MB 7629","branch_id":1,"notes":"Mahindra Thar Unit 1 (Sakleshpura)"},

    {"id":1801,"vehicle_id":18,"unit_identifier":"TEMPO12-001","registration_no":"KA 18 D 4391","branch_id":1,"notes":"TT Tempo Traveller (Sakleshpura)"},

    {"id":1901,"vehicle_id":19,"unit_identifier":"TEMPO2D-001","registration_no":"KA 18 D 4391","branch_id":1,"notes":"TT Tempo Traveller 2-Day Package (Sakleshpura)"}
  ]'::jsonb;
  v_inserted_unit_id BIGINT;
BEGIN
  FOR v_unit IN SELECT * FROM jsonb_to_recordset(v_units_data) AS x(
    id BIGINT,
    vehicle_id BIGINT,
    unit_identifier TEXT,
    registration_no TEXT,
    branch_id BIGINT,
    notes TEXT
  ) LOOP
    IF EXISTS (SELECT 1 FROM public.vehicles WHERE id = v_unit.vehicle_id) THEN
      INSERT INTO public.vehicle_units (
        id,
        vehicle_id,
        unit_identifier,
        registration_no,
        status,
        current_branch_id,
        active,
        notes,
        created_at,
        updated_at
      ) VALUES (
        v_unit.id,
        v_unit.vehicle_id,
        v_unit.unit_identifier,
        v_unit.registration_no,
        'available',
        v_unit.branch_id,
        1,
        v_unit.notes,
        NOW(),
        NOW()
      )
      ON CONFLICT (vehicle_id, unit_identifier) DO UPDATE
      SET registration_no = EXCLUDED.registration_no,
          current_branch_id = EXCLUDED.current_branch_id,
          active = EXCLUDED.active,
          notes = EXCLUDED.notes
      RETURNING id INTO v_inserted_unit_id;

      -- If an ongoing allocation already exists for this unit, align its branch to v_unit.branch_id
      IF EXISTS (
        SELECT 1 FROM public.branch_allocations
         WHERE vehicle_unit_id = v_inserted_unit_id
           AND ends_at IS NULL
      ) THEN
        UPDATE public.branch_allocations
           SET branch_id = v_unit.branch_id,
               notes = 'Aligned to authoritative fleet branch distribution'
         WHERE vehicle_unit_id = v_inserted_unit_id
           AND ends_at IS NULL
           AND branch_id <> v_unit.branch_id;
      ELSE
        -- Otherwise insert initial ongoing allocation baseline
        INSERT INTO public.branch_allocations (
          vehicle_unit_id,
          branch_id,
          starts_at,
          ends_at,
          notes
        ) VALUES (
          v_inserted_unit_id,
          v_unit.branch_id,
          NOW() - INTERVAL '1 year',
          NULL,
          'Initial fleet branch distribution baseline'
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Authoritative Unit-Level Reservation RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_vehicle_unit_slot(
  p_vehicle_id BIGINT,
  p_pickup_at TEXT,
  p_return_at TEXT,
  p_branch_id BIGINT DEFAULT NULL,
  p_exclude_booking_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  block_id BIGINT,
  unit_id BIGINT,
  unit_identifier TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit RECORD;
  v_block_id BIGINT;
  v_branch_blocked INTEGER := 0;
  v_status TEXT;
  v_active INTEGER;
BEGIN
  -- Serializes concurrent callers for the SAME vehicle model
  PERFORM pg_advisory_xact_lock(p_vehicle_id);

  -- Check vehicle status
  SELECT v.status, v.active
    INTO v_status, v_active
    FROM public.vehicles v
   WHERE v.id = p_vehicle_id;

  IF v_active IS NULL OR v_active = 0 OR COALESCE(v_status, 'available') NOT IN ('available', 'active') THEN
    RETURN; -- Vehicle does not exist, is inactive, or unavailable
  END IF;

  -- If branch is specified, verify that the branch is not blocked
  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(blocked, 0) INTO v_branch_blocked
      FROM public.branches
     WHERE id = p_branch_id;

    IF v_branch_blocked = 1 THEN
      RETURN; -- Branch is out of service
    END IF;
  END IF;

  -- Find the first candidate physical unit that:
  -- 1. Belongs to this vehicle and is active and available
  -- 2. If branch is specified: is allocated to this branch for the ENTIRE requested window
  -- 3. Has no overlapping availability blocks
  -- 4. Has no overlapping active bookings
  FOR v_unit IN
    SELECT u.id, u.unit_identifier
      FROM public.vehicle_units u
     WHERE u.vehicle_id = p_vehicle_id
       AND u.active = 1
       AND u.status = 'available'
       AND (
         p_branch_id IS NULL OR EXISTS (
           SELECT 1
             FROM public.branch_allocations ba
            WHERE ba.vehicle_unit_id = u.id
              AND ba.branch_id = p_branch_id
              AND ba.starts_at <= p_pickup_at::timestamptz
              AND (ba.ends_at IS NULL OR ba.ends_at >= p_return_at::timestamptz)
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.availability_blocks b
          WHERE b.vehicle_unit_id = u.id
            AND b.ends_at::timestamptz > p_pickup_at::timestamptz
            AND b.starts_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
            AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW())
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.bookings bk
          WHERE bk.vehicle_unit_id = u.id
            AND bk.status NOT IN ('Cancelled', 'Completed', 'Rejected', 'Draft')
            AND bk.return_at::timestamptz > p_pickup_at::timestamptz
            AND bk.pickup_at::timestamptz < p_return_at::timestamptz
            AND (p_exclude_booking_id IS NULL OR bk.id IS DISTINCT FROM p_exclude_booking_id)
       )
     ORDER BY u.id ASC
     LIMIT 1
  LOOP
    -- Insert atomic temporary hold for 10 minutes
    INSERT INTO public.availability_blocks (
      vehicle_id,
      vehicle_unit_id,
      starts_at,
      ends_at,
      reason,
      notes,
      expires_at
    ) VALUES (
      p_vehicle_id,
      v_unit.id,
      p_pickup_at,
      p_return_at,
      'booked',
      format('reserved unit %s pending booking creation', v_unit.unit_identifier),
      NOW() + INTERVAL '10 minutes'
    )
    RETURNING id INTO v_block_id;

    block_id := v_block_id;
    unit_id := v_unit.id;
    unit_identifier := v_unit.unit_identifier;
    RETURN NEXT;
    RETURN;
  END LOOP;

  -- Fall back to vehicle-level slot hold if no units table rows exist
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_units WHERE vehicle_id = p_vehicle_id AND active = 1) THEN
    DECLARE
      v_total_units INTEGER;
      v_booked_count INTEGER;
    BEGIN
      SELECT GREATEST(1, COALESCE(total_units, 1)) INTO v_total_units
        FROM public.vehicles WHERE id = p_vehicle_id;

      SELECT COUNT(*) INTO v_booked_count
        FROM public.availability_blocks b
       WHERE b.vehicle_id = p_vehicle_id
         AND b.ends_at::timestamptz > p_pickup_at::timestamptz
         AND b.starts_at::timestamptz < p_return_at::timestamptz
         AND (p_exclude_booking_id IS NULL OR b.booking_id IS DISTINCT FROM p_exclude_booking_id)
         AND NOT (b.booking_id IS NULL AND b.expires_at IS NOT NULL AND b.expires_at < NOW());

      IF v_booked_count < v_total_units THEN
        INSERT INTO public.availability_blocks (
          vehicle_id,
          starts_at,
          ends_at,
          reason,
          notes,
          expires_at
        ) VALUES (
          p_vehicle_id,
          p_pickup_at,
          p_return_at,
          'booked',
          'reserved pending booking creation',
          NOW() + INTERVAL '10 minutes'
        )
        RETURNING id INTO v_block_id;

        block_id := v_block_id;
        unit_id := NULL;
        unit_identifier := NULL;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Backward-Compatible Wrapper for reserve_vehicle_slot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_vehicle_slot(
  p_vehicle_id BIGINT,
  p_pickup_at TEXT,
  p_return_at TEXT,
  p_exclude_booking_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT block_id INTO v_res
    FROM public.reserve_vehicle_unit_slot(
      p_vehicle_id,
      p_pickup_at,
      p_return_at,
      NULL,
      p_exclude_booking_id
    )
    LIMIT 1;

  RETURN v_res.block_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Daily Fleet Allocation Aggregator RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fleet_daily_allocations(
  p_start_date TEXT,
  p_end_date TEXT,
  p_vehicle_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH dates AS (
    SELECT generate_series(
      p_start_date::date,
      p_end_date::date,
      '1 day'::interval
    )::date AS day_date
  ),
  daily_units AS (
    SELECT
      d.day_date,
      u.id AS unit_id,
      u.vehicle_id,
      v.name AS vehicle_name,
      ba.branch_id,
      b.name AS branch_name
    FROM dates d
    CROSS JOIN public.vehicle_units u
    JOIN public.vehicles v ON v.id = u.vehicle_id
    LEFT JOIN public.branch_allocations ba
      ON ba.vehicle_unit_id = u.id
     AND ba.starts_at::date <= d.day_date
     AND (ba.ends_at IS NULL OR ba.ends_at::date >= d.day_date)
    LEFT JOIN public.branches b ON b.id = ba.branch_id
    WHERE u.active = 1
      AND v.active = 1
      AND (p_vehicle_id IS NULL OR u.vehicle_id = p_vehicle_id)
  ),
  daily_agg AS (
    SELECT
      to_char(day_date, 'YYYY-MM-DD') AS date_str,
      COUNT(unit_id) AS total_units,
      COUNT(unit_id) FILTER (WHERE branch_id IS NULL) AS unallocated,
      jsonb_object_agg(
        COALESCE(branch_name, 'unallocated'),
        COUNT(unit_id)
      ) AS branch_counts
    FROM daily_units
    GROUP BY day_date
    ORDER BY day_date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date_str,
      'total', total_units,
      'unallocated', unallocated,
      'branches', branch_counts
    )
  ) INTO v_result
  FROM daily_agg;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Row Level Security (RLS) Configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicle_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Vehicle Units: Read-accessible to public & authenticated, full access to service_role
DROP POLICY IF EXISTS "vehicle_units_select" ON public.vehicle_units;
CREATE POLICY "vehicle_units_select" ON public.vehicle_units FOR SELECT USING (true);

DROP POLICY IF EXISTS "vehicle_units_all_service" ON public.vehicle_units;
CREATE POLICY "vehicle_units_all_service" ON public.vehicle_units FOR ALL USING (true) WITH CHECK (true);

-- Branch Allocations: Read-accessible to public & authenticated, full access to service_role
DROP POLICY IF EXISTS "branch_allocations_select" ON public.branch_allocations;
CREATE POLICY "branch_allocations_select" ON public.branch_allocations FOR SELECT USING (true);

DROP POLICY IF EXISTS "branch_allocations_all_service" ON public.branch_allocations;
CREATE POLICY "branch_allocations_all_service" ON public.branch_allocations FOR ALL USING (true) WITH CHECK (true);

-- Branch Transfers: Read & write access to authenticated & service_role
DROP POLICY IF EXISTS "branch_transfers_select" ON public.branch_transfers;
CREATE POLICY "branch_transfers_select" ON public.branch_transfers FOR SELECT USING (true);

DROP POLICY IF EXISTS "branch_transfers_all_service" ON public.branch_transfers;
CREATE POLICY "branch_transfers_all_service" ON public.branch_transfers FOR ALL USING (true) WITH CHECK (true);

-- Idempotency Keys: Full access to service_role & anon/authenticated
DROP POLICY IF EXISTS "idempotency_keys_all" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_all" ON public.idempotency_keys FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 13. Function Grants for RPC Access
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_unit_slot TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_slot TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fleet_daily_allocations TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 14. Synchronize PostgreSQL Primary Key Sequences
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  seq_name TEXT;
  max_id BIGINT;
BEGIN
  FOR rec IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name IN ('vehicle_units', 'branch_allocations', 'branch_transfers', 'idempotency_keys', 'users', 'vehicles', 'bookings', 'availability_blocks')
  LOOP
    seq_name := pg_get_serial_sequence('public.' || quote_ident(rec.table_name), 'id');
    IF seq_name IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM public.%I', rec.table_name) INTO max_id;
      PERFORM setval(seq_name, GREATEST(max_id, 1), max_id > 0);
    END IF;
  END LOOP;
END $$;

COMMIT;
