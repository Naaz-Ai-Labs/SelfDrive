-- Darshh Holiday PostgreSQL Schema for Supabase
-- Contains full database structure including Payments Ledger & Webhook Event Audit Trail

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','finance','staff')),
  branch TEXT,
  permissions TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS staff_history (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_history_staff ON staff_history(staff_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  date_of_birth TEXT,
  emergency_contact TEXT,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicle_categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'bike' CHECK (kind IN ('bike','scooter','car','van')),
  icon TEXT,
  image TEXT,
  short_desc TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  category_id BIGINT REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  registration_no TEXT,
  cc INTEGER,
  fuel_type TEXT NOT NULL DEFAULT 'Petrol',
  transmission TEXT NOT NULL DEFAULT 'Manual',
  seats INTEGER NOT NULL DEFAULT 2,
  mileage TEXT,
  included_km INTEGER NOT NULL DEFAULT 100,
  extra_km_rate NUMERIC(10, 2) NOT NULL DEFAULT 8,
  rate_12h NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rate_24h NUMERIC(10, 2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  weekend_rate_24h NUMERIC(10, 2),
  deposit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  late_fee_per_hour NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','maintenance','archived')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(category_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES vehicle_categories(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL DEFAULT 'weekend' CHECK (day_type IN ('weekend','long_weekend','holiday','festival','peak','off_season')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rate_24h NUMERIC(10, 2),
  rate_12h NUMERIC(10, 2),
  deposit NUMERIC(10, 2),
  included_km INTEGER,
  extra_km_rate NUMERIC(10, 2),
  min_days INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_dates ON pricing_rules(start_date, end_date);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'booked' CHECK (reason IN ('booked','maintenance','manual_block')),
  booking_id BIGINT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_availability_vehicle ON availability_blocks(vehicle_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS terms_versions (
  id BIGSERIAL PRIMARY KEY,
  version INTEGER UNIQUE NOT NULL,
  content TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enquiries (
  id BIGSERIAL PRIMARY KEY,
  enquiry_no TEXT UNIQUE NOT NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  category_id BIGINT REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  pickup_date TEXT,
  return_date TEXT,
  pickup_time TEXT,
  return_time TEXT,
  location TEXT,
  budget_min NUMERIC(10, 2),
  budget_max NUMERIC(10, 2),
  passengers INTEGER,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'Website',
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'New',
  notes TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  draft_token TEXT UNIQUE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_enquiries_stage ON enquiries(stage);

CREATE TABLE IF NOT EXISTS enquiry_history (
  id BIGSERIAL PRIMARY KEY,
  enquiry_id BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  booking_no TEXT UNIQUE NOT NULL,
  enquiry_id BIGINT REFERENCES enquiries(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  pickup_at TEXT NOT NULL,
  return_at TEXT NOT NULL,
  actual_pickup_at TEXT,
  actual_return_at TEXT,
  after_hours INTEGER NOT NULL DEFAULT 0,
  after_hours_approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  base_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  surcharge_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  extra_hours_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  other_fees_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  extra_km_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  late_fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  damage_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  included_km INTEGER NOT NULL DEFAULT 0,
  start_odometer NUMERIC(10, 2),
  end_odometer NUMERIC(10, 2),
  manager_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  terms_version_id BIGINT REFERENCES terms_versions(id) ON DELETE SET NULL,
  terms_accepted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pickup ON bookings(pickup_at, return_at);

CREATE TABLE IF NOT EXISTS booking_history (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_booking_history_booking ON booking_history(booking_id);

CREATE TABLE IF NOT EXISTS customer_documents (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('licence','govt_id','address_proof','photo','other')),
  number TEXT,
  expiry_date TEXT,
  file_path TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);

CREATE TABLE IF NOT EXISTS inspections (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('handover','return')),
  employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  odometer NUMERIC(10, 2),
  fuel_level TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspections_booking ON inspections(booking_id);

CREATE TABLE IF NOT EXISTS inspection_photos (
  id BIGSERIAL PRIMARY KEY,
  inspection_id BIGINT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('front','rear','left','right','odometer','fuel','damage','customer')),
  url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS damage_reports (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  inspection_id BIGINT REFERENCES inspections(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  charge_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manual_adjustments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('late_fee_waiver','late_fee_change','price_override','discount','damage_charge','other')),
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_booking ON manual_adjustments(booking_id);

-- Extended Payments Transaction Ledger Table
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  payment_no TEXT UNIQUE NOT NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  amount_paise BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('advance','full','deposit','extra_charge')),
  method TEXT,
  gateway_ref TEXT,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  due_date TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  receipt_no TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_order ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_payment ON payments(razorpay_payment_id);

-- Payment Events & Webhook Audit Trail Table
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  payload TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 1,
  processed INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);

CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  refund_no TEXT UNIQUE NOT NULL,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  requested_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'Requested',
  method TEXT,
  transaction_ref TEXT,
  admin_notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_no TEXT UNIQUE NOT NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_no TEXT UNIQUE NOT NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  media TEXT NOT NULL DEFAULT '[]',
  location TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  replacement_vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  cost NUMERIC(10, 2),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Normal',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not started',
  checklist TEXT NOT NULL DEFAULT '[]',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  enquiry_id BIGINT REFERENCES enquiries(id) ON DELETE SET NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  to_address TEXT,
  subject TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  subject TEXT,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  enquiry_id BIGINT REFERENCES enquiries(id) ON DELETE SET NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  kind TEXT,
  name TEXT NOT NULL,
  path TEXT,
  size INTEGER,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER,
  review TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vehicle TEXT,
  location TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  quote TEXT NOT NULL,
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  image TEXT NOT NULL,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover TEXT,
  author TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faqs (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGSERIAL PRIMARY KEY,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  detail TEXT,
  ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================================================
-- Physical Vehicle Units & Dynamic Multi-Branch Allocation
-- ===========================================================================

CREATE TABLE IF NOT EXISTS vehicle_units (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  unit_identifier TEXT NOT NULL,
  registration_no TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'maintenance', 'blocked', 'transit', 'inactive')),
  current_branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_vehicle_unit_identifier UNIQUE (vehicle_id, unit_identifier)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_vehicle ON vehicle_units(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_branch ON vehicle_units(current_branch_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_status ON vehicle_units(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_units_active ON vehicle_units(active);

CREATE TABLE IF NOT EXISTS branch_allocations (
  id BIGSERIAL PRIMARY KEY,
  vehicle_unit_id BIGINT NOT NULL REFERENCES vehicle_units(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branch_allocations_unit ON branch_allocations(vehicle_unit_id);
CREATE INDEX IF NOT EXISTS idx_branch_allocations_branch ON branch_allocations(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_allocations_dates ON branch_allocations(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS branch_transfers (
  id BIGSERIAL PRIMARY KEY,
  vehicle_unit_id BIGINT NOT NULL REFERENCES vehicle_units(id) ON DELETE CASCADE,
  from_branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  to_branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reason TEXT,
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_unit ON branch_transfers(vehicle_unit_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_dates ON branch_transfers(effective_date);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_json TEXT,
  status_code INTEGER DEFAULT 200,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

