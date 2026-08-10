import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import bcrypt from "bcryptjs";

export type DatabaseSync = any;

export function getWritableDataDir(): string {
  if (process.env.VERCEL) {
    const tmpDir = path.join(os.tmpdir(), "darshan-crm-data");
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
  try {
    const localDir = path.join(process.cwd(), "data");
    fs.mkdirSync(localDir, { recursive: true });
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), "darshan-crm-data");
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
}

export function getWritableUploadsDir(): string {
  const uploadsDir = path.join(getWritableDataDir(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}

let db: any = null;

function createDatabaseInstance(dbPath: string): any {
  const req = eval("require");
  try {
    const BetterSqlite = req("better-sqlite3");
    return new BetterSqlite(dbPath);
  } catch {
    try {
      const NodeSqlite = req("node:sqlite").DatabaseSync;
      return new NodeSqlite(dbPath);
    } catch {
      try {
        const BetterSqlite = req("better-sqlite3");
        return new BetterSqlite(":memory:");
      } catch (err: any) {
        throw new Error("Failed to initialize SQLite database engine: " + (err?.message || err));
      }
    }
  }
}

let isHydrating = false;

export function getDb(): any {
  if (db) return db;
  const dataDir = getWritableDataDir();
  const dbPath = path.join(dataDir, "darshan.db");
  db = createDatabaseInstance(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // PRAGMA journal_mode WAL may be ignored in memory mode
  }
  applySchema(db);
  ensureDefaultUsers(db);

  try {
    const vehCount = db.prepare("SELECT COUNT(*) AS c FROM vehicles").get() as { c: number } | undefined;
    if (!vehCount || vehCount.c === 0) {
      seedSync(db);
      if (!isHydrating) {
        isHydrating = true;
        import("./hydrate-db")
          .then(({ hydrateSQLiteFromSupabase }) => {
            hydrateSQLiteFromSupabase(db).catch(() => {});
          })
          .catch(() => {});
      }
    }
  } catch {}

  return db;
}

function seedSync(targetDb: any) {
  try {
    targetDb.exec(`
      INSERT OR IGNORE INTO branches (id, name, city, address, phone, active) VALUES
      (1, 'Sakleshpura Main Branch', 'Sakleshpura', 'BM Road, near Bus Stand, Sakleshpura', '+919845210001', 1),
      (2, 'Hassan City Branch', 'Hassan', 'BBM Road, Hassan', '+919845210002', 1);

      INSERT OR IGNORE INTO vehicle_categories (id, slug, name, kind, short_desc, description, active, sort) VALUES
      (1, 'cars', 'Cars', 'car', 'Self-drive hatchbacks, sedans & SUVs', 'Well maintained self-drive car fleet.', 1, 1),
      (2, 'bikes', 'Bikes', 'bike', 'Cruisers and commuter bikes', 'Well-serviced bikes for trips.', 1, 2),
      (3, 'scooters', 'Scooters', 'scooter', 'Automatic scooters for local travel', 'Simple automatic scooters.', 1, 3),
      (4, 'tempo-traveller', 'Tempo Traveller', 'van', 'Chauffeur driven tempo traveller', 'Group sightseeing trips.', 1, 4);

      INSERT OR IGNORE INTO vehicles (id, slug, name, brand, model, year, category_id, branch_id, registration_no, cc, fuel_type, transmission, seats, mileage, included_km, extra_km_rate, rate_12h, rate_24h, hourly_rate, weekend_rate_24h, deposit, late_fee_per_hour, total_units, description, status, active) VALUES
      (1, 'honda-dio', 'Honda Dio', 'Honda', 'Dio', 2023, 3, 1, 'KA-46-E-1234', 110, 'Petrol', 'Automatic', 2, '45 km/l', 100, 4, 500, 900, 100, 950, 1000, 100, 3, 'Light, easy-to-ride scooter.', 'available', 1),
      (2, 'honda-activa', 'Honda Activa 6G', 'Honda', 'Activa 6G', 2023, 3, 1, 'KA-46-E-5678', 110, 'Petrol', 'Automatic', 2, '50 km/l', 100, 4, 500, 900, 100, 950, 1000, 100, 4, 'Automatic, light and simple to ride.', 'available', 1),
      (3, 'tvs-jupiter', 'TVS Jupiter', 'TVS', 'Jupiter', 2023, 3, 1, 'KA-46-E-9012', 110, 'Petrol', 'Automatic', 2, '50 km/l', 100, 4, 500, 900, 100, 950, 1000, 100, 3, 'Smooth ride with high comfort.', 'available', 1),
      (4, 'yamaha-rayzr', 'Yamaha RayZR', 'Yamaha', 'RayZR', 2023, 3, 1, 'KA-46-E-3456', 125, 'Petrol', 'Automatic', 2, '52 km/l', 100, 4, 550, 950, 100, 1000, 1000, 100, 2, 'Sporty 125cc scooter.', 'available', 1),
      (5, 'tvs-ntorq', 'TVS NTorq 125', 'TVS', 'NTorq', 2023, 3, 1, 'KA-46-E-7890', 125, 'Petrol', 'Automatic', 2, '45 km/l', 100, 4, 600, 1000, 110, 1050, 1000, 100, 3, 'Performance scooter with bluetooth console.', 'available', 1),

      (6, 'tvs-ronin', 'TVS Ronin 225', 'TVS', 'Ronin', 2023, 2, 1, 'KA-46-M-9012', 225, 'Petrol', 'Manual', 2, '35 km/l', 100, 4, 1000, 1800, 150, 1850, 1000, 120, 2, 'Modern cruiser styling.', 'available', 1),
      (7, 'honda-cb200x', 'Honda CB200X', 'Honda', 'CB200X', 2023, 2, 1, 'KA-46-M-3456', 184, 'Petrol', 'Manual', 2, '38 km/l', 100, 4, 1000, 1800, 150, 1850, 1000, 120, 2, 'Adventure-styled bike.', 'available', 1),
      (8, 'tvs-raider', 'TVS Raider 125', 'TVS', 'Raider', 2023, 2, 1, 'KA-46-M-1122', 125, 'Petrol', 'Manual', 2, '55 km/l', 100, 4, 700, 1200, 110, 1250, 1000, 100, 2, 'Sleek commuter bike.', 'available', 1),
      (9, 'bajaj-pulsar-ns', 'Bajaj Pulsar NS200', 'Bajaj', 'Pulsar NS', 2023, 2, 1, 'KA-46-M-3344', 200, 'Petrol', 'Manual', 2, '35 km/l', 100, 4, 800, 1300, 120, 1350, 1000, 100, 2, 'Naked streetfighter performance.', 'available', 1),
      (10, 'honda-shine', 'Honda Shine 125', 'Honda', 'Shine', 2023, 2, 1, 'KA-46-M-5566', 125, 'Petrol', 'Manual', 2, '55 km/l', 100, 4, 600, 1000, 100, 1050, 1000, 100, 2, 'Reliable and comfortable commuter.', 'available', 1),

      (11, 'maruti-baleno-manual', 'Maruti Suzuki Baleno', 'Maruti Suzuki', 'Baleno', 2023, 1, 1, 'KA-46-C-7890', 1197, 'Petrol', 'Manual', 5, '21 km/l', 300, 8, 2000, 3500, 200, 3550, 2000, 150, 2, 'Comfortable premium hatchback.', 'available', 1),
      (13, 'maruti-dzire', 'Maruti Dzire', 'Maruti Suzuki', 'Dzire', 2023, 1, 1, 'KA-46-C-1122', 1197, 'Petrol', 'Manual', 5, '23 km/l', 300, 8, 2000, 3500, 200, 3550, 2000, 150, 2, 'Fuel-efficient compact sedan.', 'available', 1),
      (14, 'maruti-ciaz', 'Maruti Ciaz', 'Maruti Suzuki', 'Ciaz', 2023, 1, 1, 'KA-46-C-3344', 1462, 'Petrol', 'Manual', 5, '20 km/l', 300, 8, 2400, 4000, 240, 4050, 2500, 180, 1, 'Spacious premium sedan for highway trips.', 'available', 1),
      (15, 'maruti-ertiga-7-seater', 'Maruti Ertiga 7 Seater', 'Maruti Suzuki', 'Ertiga', 2023, 1, 1, 'KA-46-C-5566', 1462, 'Petrol', 'Manual', 7, '19 km/l', 300, 8, 2800, 4500, 280, 4550, 3000, 200, 1, 'Spacious 7-seater MPV for family trips.', 'available', 1),
      (16, 'mahindra-thar-manual', 'Mahindra Thar 4x4', 'Mahindra', 'Thar', 2023, 1, 1, 'KA-46-C-9999', 2184, 'Diesel', 'Manual', 4, '15 km/l', 300, 8, 3000, 5000, 300, 5500, 3000, 250, 1, 'Iconic 4x4 SUV for offroad exploration.', 'available', 1),

      (18, 'tempo-traveller-12', 'Tempo Traveller — Sakleshpura Sightseeing', 'Force Motors', 'Traveller', 2023, 4, 1, 'KA-46-V-1212', 2596, 'Diesel', 'Manual', 12, '12 km/l', 999, 0, 8000, 12000, 500, 12050, 2000, 250, 1, 'Chauffeur driven 12 seater for day trips.', 'available', 1),
      (19, 'tempo-traveller-2days', 'Tempo Traveller — Sakleshpura & Chikmagalur (2 Days)', 'Force Motors', 'Traveller', 2023, 4, 1, 'KA-46-V-1213', 2596, 'Diesel', 'Manual', 12, '12 km/l', 999, 0, 8000, 12000, 500, 12050, 2000, 250, 1, 'Chauffeur driven 12 seater for 2-day hill station tours.', 'available', 1);

      INSERT OR IGNORE INTO vehicle_photos (vehicle_id, url, is_primary) VALUES
      (1, '/vehicles/honda-dio.avif', 1),
      (2, '/vehicles/honda-activa.webp', 1),
      (3, '/vehicles/tvs-jupiter.webp', 1),
      (4, '/vehicles/yamaha-rayzr.avif', 1),
      (5, '/vehicles/tvs-ntorq.webp', 1),
      (6, '/vehicles/tvs-ronin.avif', 1),
      (7, '/vehicles/honda-cb200x.jpg', 1),
      (8, '/vehicles/tvs-radar.avif', 1),
      (9, '/vehicles/bajaj-pulsar-ns.png', 1),
      (10, '/vehicles/honda-shine.avif', 1),
      (11, '/vehicles/baleno-manual.avif', 1),
      (13, '/vehicles/maruti-dzire.avif', 1),
      (14, '/vehicles/maruti-ciaz.jpg', 1),
      (15, '/vehicles/maruti-ertiga.avif', 1),
      (16, '/vehicles/mahindra-thar.avif', 1),
      (18, '/vehicles/tempo-traveller.jpg', 1),
      (19, '/vehicles/cta-tempo-banner.jpg', 1);

      INSERT OR IGNORE INTO terms_versions (version, content, is_active) VALUES
      (1, '["Valid original Driving Licence & Government ID (Aadhaar/Passport) mandatory for vehicle handover.","Included drive limit per day. Driving beyond this limit is charged per KM.","Fuel policy: Return the vehicle with the same fuel level as provided at pickup.","Security deposit is fully refundable upon safe vehicle return inspection.","Late returns exceeding 1 minute add full 24-hour additional day rental charges."]', 1);
    `);
  } catch (err) {
    console.warn("seedSync error:", err);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','finance','staff')),
  branch TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,
  left_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_history_staff ON staff_history(staff_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicle_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  category_id INTEGER REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  registration_no TEXT,
  cc INTEGER,
  fuel_type TEXT NOT NULL DEFAULT 'Petrol',
  transmission TEXT NOT NULL DEFAULT 'Manual',
  seats INTEGER NOT NULL DEFAULT 2,
  mileage TEXT,
  included_km INTEGER NOT NULL DEFAULT 100,
  extra_km_rate REAL NOT NULL DEFAULT 8,
  rate_12h REAL NOT NULL DEFAULT 0,
  rate_24h REAL NOT NULL DEFAULT 0,
  hourly_rate REAL NOT NULL DEFAULT 0,
  weekend_rate_24h REAL,
  deposit REAL NOT NULL DEFAULT 0,
  late_fee_per_hour REAL NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','maintenance','archived')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(category_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES vehicle_categories(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL DEFAULT 'weekend' CHECK (day_type IN ('weekend','long_weekend','holiday','festival','peak','off_season')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rate_24h REAL,
  rate_12h REAL,
  deposit REAL,
  included_km INTEGER,
  extra_km_rate REAL,
  min_days INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_dates ON pricing_rules(start_date, end_date);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'booked' CHECK (reason IN ('booked','maintenance','manual_block')),
  booking_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_availability_vehicle ON availability_blocks(vehicle_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS terms_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER UNIQUE NOT NULL,
  content TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  pickup_date TEXT,
  return_date TEXT,
  pickup_time TEXT,
  return_time TEXT,
  location TEXT,
  budget_min REAL,
  budget_max REAL,
  passengers INTEGER,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'Website',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'New',
  notes TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  draft_token TEXT UNIQUE,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_enquiries_stage ON enquiries(stage);

CREATE TABLE IF NOT EXISTS enquiry_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_no TEXT UNIQUE NOT NULL,
  enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  pickup_at TEXT NOT NULL,
  return_at TEXT NOT NULL,
  actual_pickup_at TEXT,
  actual_return_at TEXT,
  after_hours INTEGER NOT NULL DEFAULT 0,
  after_hours_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  base_amount REAL NOT NULL DEFAULT 0,
  surcharge_amount REAL NOT NULL DEFAULT 0,
  extra_hours_amount REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  deposit_amount REAL NOT NULL DEFAULT 0,
  other_fees_amount REAL NOT NULL DEFAULT 0,
  extra_km_amount REAL NOT NULL DEFAULT 0,
  late_fee_amount REAL NOT NULL DEFAULT 0,
  damage_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  included_km INTEGER NOT NULL DEFAULT 0,
  start_odometer REAL,
  end_odometer REAL,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  terms_version_id INTEGER REFERENCES terms_versions(id) ON DELETE SET NULL,
  terms_accepted_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pickup ON bookings(pickup_at, return_at);

CREATE TABLE IF NOT EXISTS booking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_history_booking ON booking_history(booking_id);

CREATE TABLE IF NOT EXISTS customer_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('licence','govt_id','address_proof','photo','other')),
  number TEXT,
  expiry_date TEXT,
  file_path TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('handover','return')),
  employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  odometer REAL,
  fuel_level TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inspections_booking ON inspections(booking_id);

CREATE TABLE IF NOT EXISTS inspection_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('front','rear','left','right','odometer','fuel','damage','customer')),
  url TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS damage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  inspection_id INTEGER REFERENCES inspections(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  charge_amount REAL NOT NULL DEFAULT 0,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manual_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('late_fee_waiver','late_fee_change','price_override','discount','damage_charge','other')),
  amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adjustments_booking ON manual_adjustments(booking_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_no TEXT UNIQUE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  kind TEXT NOT NULL DEFAULT 'advance' CHECK (kind IN ('advance','full','deposit','extra_charge')),
  method TEXT,
  gateway_ref TEXT,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  due_date TEXT,
  paid_at TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  receipt_no TEXT,
  breakdown_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_order ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_payment ON payments(razorpay_payment_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  payload TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 1,
  processed INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON payment_events(event_id);


CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_no TEXT UNIQUE NOT NULL,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  requested_amount REAL NOT NULL DEFAULT 0,
  approved_amount REAL,
  status TEXT NOT NULL DEFAULT 'Requested',
  method TEXT,
  transaction_ref TEXT,
  admin_notes TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_pct REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problem_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT UNIQUE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('breakdown','tyre','battery','engine','accident','existing_damage','fuel','document','misuse','other')),
  description TEXT NOT NULL,
  media TEXT NOT NULL DEFAULT '[]',
  location TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  replacement_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  cost REAL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Normal',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not started',
  checklist TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_booking ON tasks(booking_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  to_address TEXT,
  subject TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  subject TEXT,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  kind TEXT,
  name TEXT NOT NULL,
  path TEXT,
  size INTEGER,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER,
  review TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  vehicle TEXT,
  location TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  quote TEXT NOT NULL,
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  image TEXT NOT NULL,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover TEXT,
  author TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function applySchema(database: DatabaseSync) {
  try { database.exec("ALTER TABLE vehicles ADD COLUMN total_units INTEGER NOT NULL DEFAULT 1;"); } catch {}
  try { database.exec("ALTER TABLE users ADD COLUMN left_at TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN amount_paise INTEGER NOT NULL DEFAULT 0;"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN razorpay_order_id TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN razorpay_payment_id TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN razorpay_signature TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payments ADD COLUMN breakdown_json TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payment_events ADD COLUMN razorpay_order_id TEXT;"); } catch {}
  try { database.exec("ALTER TABLE payment_events ADD COLUMN razorpay_payment_id TEXT;"); } catch {}

  database.exec(SCHEMA);

  try {
    database.exec("UPDATE vehicles SET included_km = 300 WHERE category_id = 1;");
    database.exec("UPDATE vehicles SET included_km = 999 WHERE category_id = 4;");
    database.exec("UPDATE vehicles SET included_km = 100 WHERE category_id IN (2, 3);");
    database.exec("UPDATE settings SET value = '6' WHERE key = 'tax_pct';");
    database.exec("UPDATE settings SET value = 'Pre-booking only · Mon–Sun, 8:00 AM – 8:00 AM' WHERE key = 'hours';");
    database.exec("UPDATE settings SET value = '08:00 AM - 08:00 AM' WHERE key = 'operating_hours';");
    database.exec("UPDATE vehicles SET total_units = 4 WHERE id = 1;"); // Honda Dio
    database.exec("UPDATE vehicles SET total_units = 2 WHERE id = 2;"); // Honda Activa
    database.exec("UPDATE vehicles SET total_units = 6 WHERE id = 3;"); // TVS Jupiter
    database.exec("UPDATE vehicles SET total_units = 2 WHERE id = 4;"); // Yamaha RayZR
    database.exec("UPDATE vehicles SET total_units = 3 WHERE id = 5;"); // TVS NTorq
    database.exec("UPDATE vehicles SET total_units = 2 WHERE id = 6;"); // TVS Radar
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 7;"); // Pulsar NS
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 8;"); // TVS Ronin
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 9;"); // Honda CB200X
    database.exec("UPDATE vehicles SET total_units = 2 WHERE id = 10;"); // Honda Shine
    database.exec("UPDATE vehicles SET total_units = 2 WHERE id = 11;"); // Baleno
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 13;"); // Dzire
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 14;"); // Ciaz
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 15;"); // Ertiga
    database.exec("UPDATE vehicles SET total_units = 1 WHERE id = 16;"); // Thar
    database.exec(`
      UPDATE terms_versions SET content = '${JSON.stringify([
        "A valid driving licence and government photo ID are required at pickup.",
        "Minimum customer age: 21 years for two-wheelers, 23 years for cars.",
        "Security deposit is fully refundable after inspection, minus approved deductions.",
        "Vehicles are rented without fuel — return with the same fuel level received.",
        "Standard rental day is 8:00 AM to 8:00 AM (24 hours cycle).",
        "Included drive limit is 100 km per day. Driving beyond this limit is charged at ₹8 per KM.",
        "The customer is responsible for traffic fines, tolls and challans incurred during the rental.",
        "This is a fixed-price rental — no bargaining on listed rates.",
        "Sub-letting the vehicle to a third party is strictly prohibited.",
        "Cancellations made more than 24 hours before pickup are eligible for a full refund minus a small processing fee.",
        "In case of breakdown or accident, contact us immediately — do not attempt repairs without approval.",
        "In case of any accident or damage, notify the vehicle owner immediately. Do not take any action or arrange repairs on your own."
      ])}' WHERE active = 1;
    `);
  } catch {
    // Ignore migration error if initializing
  }
}

function ensureDefaultUsers(database: DatabaseSync) {
  try {
    const defaultUsers = [
      { name: "Administrator", email: "admin@darshhrentals.in", phone: "+917676875595", pass: "Admin@123", role: "admin" },
      { name: "Branch Manager", email: "manager@darshhrentals.in", phone: "+917676875596", pass: "Manager@123", role: "manager" },
      { name: "Handover Staff", email: "staff@darshhrentals.in", phone: "+917676875597", pass: "Staff@123", role: "staff" },
      { name: "Accounts", email: "finance@darshhrentals.in", phone: "+917676875598", pass: "Finance@123", role: "finance" },
      { name: "Darshan Admin", email: "admin@darshh.com", phone: "+919876500001", pass: "AdminPassword123!", role: "admin" },
      { name: "Rahul Sharma", email: "rahul.staff@darshh.com", phone: "+919876500002", pass: "StaffPassword123!", role: "staff" },
      { name: "Priya Patel", email: "priya.staff@darshh.com", phone: "+919876500003", pass: "StaffPassword123!", role: "staff" },
      { name: "Amit Kumar", email: "amit.staff@darshh.com", phone: "+919876500004", pass: "StaffPassword123!", role: "staff" },
      { name: "Neha Singh", email: "neha.staff@darshh.com", phone: "+919876500005", pass: "StaffPassword123!", role: "staff" },
    ];

    for (const u of defaultUsers) {
      const hash = bcrypt.hashSync(u.pass, 10);
      database
        .prepare(
          "INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)"
        )
        .run(u.name, u.email.toLowerCase().trim(), u.phone, hash, u.role);
    }
  } catch {
    // Ignore seeding warning if initializing
  }
}

export function runNow<T = void>(fn: (database: DatabaseSync) => T): T {
  const database = getDb();
  return fn(database);
}
