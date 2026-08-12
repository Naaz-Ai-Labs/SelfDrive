import { getDb } from "./db";
import { getDynamicRate24h } from "./pricing";

export type VehicleCategory = {
  id: number;
  slug: string;
  name: string;
  kind: "bike" | "scooter" | "car" | "van";
  icon: string | null;
  image: string | null;
  short_desc: string | null;
  description: string | null;
  active: number;
  sort: number;
};

export type Vehicle = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  model: string;
  year: number | null;
  category_id: number | null;
  category_name: string | null;
  category_kind: string | null;
  category_slug: string | null;
  branch_id: number | null;
  branch_name: string | null;
  registration_no: string | null;
  cc: number | null;
  fuel_type: string;
  transmission: string;
  seats: number;
  mileage: string | null;
  included_km: number;
  extra_km_rate: number;
  rate_12h: number;
  rate_24h: number;
  hourly_rate: number;
  weekend_rate_24h: number | null;
  deposit: number;
  late_fee_per_hour: number;
  total_units: number;
  available_units: number;
  description: string | null;
  terms: string | null;
  status: string;
  active: number;
  photos: string[];
  primary_photo: string | null;
};

export type Branch = { id: number; name: string; city: string | null; address: string | null; phone: string | null; active: number };

const DEFAULT_SLUG_PHOTOS: Record<string, string> = {
  "honda-dio": "/vehicles/honda-dio.avif",
  "honda-activa": "/vehicles/honda-activa.webp",
  "tvs-jupiter": "/vehicles/tvs-jupiter.webp",
  "yamaha-rayzr": "/vehicles/yamaha-rayzr.avif",
  "tvs-ntorq": "/vehicles/tvs-ntorq.webp",
  "tvs-ronin": "/vehicles/tvs-ronin.avif",
  "honda-cb200x": "/vehicles/honda-cb200x.jpg",
  "tvs-raider": "/vehicles/tvs-radar.avif",
  "bajaj-pulsar-ns": "/vehicles/bajaj-pulsar-ns.png",
  "honda-shine": "/vehicles/honda-shine.avif",
  "maruti-baleno-manual": "/vehicles/baleno-manual.avif",
  "maruti-dzire": "/vehicles/maruti-dzire.avif",
  "maruti-ciaz": "/vehicles/maruti-ciaz.jpg",
  "maruti-ertiga-7-seater": "/vehicles/maruti-ertiga.avif",
  "mahindra-thar-manual": "/vehicles/mahindra-thar.avif",
  "tempo-traveller-12": "/vehicles/tempo-traveller.jpg",
  "tempo-traveller-2days": "/vehicles/cta-tempo-banner.jpg",
};

function attachPhotos(vehicle: Record<string, unknown>): Vehicle {
  const db = getDb();
  const rawPhotos = db
    .prepare("SELECT url FROM vehicle_photos WHERE vehicle_id = ? ORDER BY is_primary DESC, sort")
    .all(vehicle.id as number) as Array<{ url: string }>;

  const slug = String(vehicle.slug ?? "");
  const fallbackPhoto = DEFAULT_SLUG_PHOTOS[slug] || "/vehicles/baleno-manual.avif";
  const photoUrls = rawPhotos.length > 0 ? rawPhotos.map((p) => p.url) : [fallbackPhoto];

  const booked = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bookings
       WHERE vehicle_id = ?
         AND status IN ('Confirmed', 'Vehicle handed over', 'Active rental', 'Pending verification', 'Enquiry', 'Draft')
         AND datetime(return_at) >= datetime('now')`
    )
    .get(vehicle.id as number) as { c: number } | undefined;

  const totalUnits = Number(vehicle.total_units ?? 1);
  const bookedCount = booked?.c ?? 0;
  const availableUnits = Math.max(0, totalUnits - bookedCount);

  const baseRate24h = Number(vehicle.rate_24h ?? 0);
  const weekendRate24h = Math.max(baseRate24h + 50, Number(vehicle.weekend_rate_24h ?? (baseRate24h + 50)));

  return {
    ...(vehicle as unknown as Vehicle),
    rate_24h: baseRate24h,
    weekend_rate_24h: weekendRate24h,
    total_units: totalUnits,
    available_units: availableUnits,
    photos: photoUrls,
    primary_photo: photoUrls[0] ?? fallbackPhoto,
  };
}

export function getVehicleCategories(onlyActive = true): VehicleCategory[] {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM vehicle_categories ${onlyActive ? "WHERE active = 1" : ""} ORDER BY sort, name`)
      .all() as Array<Record<string, unknown>>;
    if (rows.length > 0) return rows.map((r) => ({ ...r })) as unknown as VehicleCategory[];
  } catch {}
  return [
    { id: 1, name: "Cars", slug: "cars", kind: "car", description: "Hatchbacks, Sedans & SUVs", icon: "car", sort: 1, active: 1 },
    { id: 2, name: "Bikes", slug: "bikes", kind: "bike", description: "Cruisers & Commuters", icon: "bike", sort: 2, active: 1 },
    { id: 3, name: "Scooters", slug: "scooters", kind: "scooter", description: "Gearless Scooters", icon: "scooter", sort: 3, active: 1 },
    { id: 4, name: "Tempo Traveller", slug: "tempo-traveller", kind: "van", description: "Group Tour Vans", icon: "van", sort: 4, active: 1 },
  ] as VehicleCategory[];
}

export function getVehicleCategory(slug: string): VehicleCategory | null {
  try {
    const row = getDb().prepare("SELECT * FROM vehicle_categories WHERE slug = ? AND active = 1").get(slug) as VehicleCategory | undefined;
    if (row) return row;
  } catch {}
  return getVehicleCategories().find((c) => c.slug === slug) ?? null;
}

export type VehicleFilters = {
  categorySlug?: string;
  kind?: string;
  minSeats?: number;
  transmission?: string;
  fuelType?: string;
  maxPrice?: number;
  onlyAvailable?: boolean;
};

const FALLBACK_VEHICLES: Vehicle[] = [
  // Scooters (Category 3)
  { id: 1, slug: "honda-dio", name: "Honda Dio", brand: "Honda", model: "Dio", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-1234", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Light, easy-to-ride scooter.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-dio.avif"], primary_photo: "/vehicles/honda-dio.avif" },
  { id: 2, slug: "honda-activa", name: "Honda Activa 6G", brand: "Honda", model: "Activa 6G", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-5678", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 4, available_units: 4, description: "Automatic, light and simple to ride.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-activa.webp"], primary_photo: "/vehicles/honda-activa.webp" },
  { id: 3, slug: "tvs-jupiter", name: "TVS Jupiter", brand: "TVS", model: "Jupiter", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-9012", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Smooth ride with high comfort.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-jupiter.webp"], primary_photo: "/vehicles/tvs-jupiter.webp" },
  { id: 4, slug: "yamaha-rayzr", name: "Yamaha RayZR", brand: "Yamaha", model: "RayZR", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-3456", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "52 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 550, rate_24h: 950, hourly_rate: 100, weekend_rate_24h: 1000, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Sporty 125cc scooter.", terms: null, status: "available", active: 1, photos: ["/vehicles/yamaha-rayzr.avif"], primary_photo: "/vehicles/yamaha-rayzr.avif" },
  { id: 5, slug: "tvs-ntorq", name: "TVS NTorq 125", brand: "TVS", model: "NTorq", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-7890", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 110, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Performance scooter with bluetooth console.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-ntorq.webp"], primary_photo: "/vehicles/tvs-ntorq.webp" },

  // Bikes (Category 2)
  { id: 6, slug: "tvs-ronin", name: "TVS Ronin 225", brand: "TVS", model: "Ronin", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-9012", cc: 225, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Modern cruiser styling.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-ronin.avif"], primary_photo: "/vehicles/tvs-ronin.avif" },
  { id: 7, slug: "honda-cb200x", name: "Honda CB200X", brand: "Honda", model: "CB200X", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-3456", cc: 184, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "38 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Adventure-styled bike.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-cb200x.jpg"], primary_photo: "/vehicles/honda-cb200x.jpg" },
  { id: 8, slug: "tvs-raider", name: "TVS Raider 125", brand: "TVS", model: "Raider", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-1122", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 700, rate_24h: 1200, hourly_rate: 110, weekend_rate_24h: 1250, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Sleek commuter bike.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-radar.avif"], primary_photo: "/vehicles/tvs-radar.avif" },
  { id: 9, slug: "bajaj-pulsar-ns", name: "Bajaj Pulsar NS200", brand: "Bajaj", model: "Pulsar NS", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-3344", cc: 200, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 800, rate_24h: 1300, hourly_rate: 120, weekend_rate_24h: 1350, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Naked streetfighter performance.", terms: null, status: "available", active: 1, photos: ["/vehicles/bajaj-pulsar-ns.png"], primary_photo: "/vehicles/bajaj-pulsar-ns.png" },
  { id: 10, slug: "honda-shine", name: "Honda Shine 125", brand: "Honda", model: "Shine", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-5566", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 100, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Reliable and comfortable commuter.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-shine.avif"], primary_photo: "/vehicles/honda-shine.avif" },

  // Cars (Category 1) — ALL 7 CARS
  { id: 11, slug: "maruti-baleno-manual", name: "Maruti Suzuki Baleno", brand: "Maruti Suzuki", model: "Baleno", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-7890", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "21 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 2, available_units: 2, description: "Comfortable premium hatchback.", terms: null, status: "available", active: 1, photos: ["/vehicles/baleno-manual.avif"], primary_photo: "/vehicles/baleno-manual.avif" },
  { id: 13, slug: "maruti-dzire", name: "Maruti Dzire", brand: "Maruti Suzuki", model: "Dzire", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-1122", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "23 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 2, available_units: 2, description: "Fuel-efficient compact sedan.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-dzire.avif"], primary_photo: "/vehicles/maruti-dzire.avif" },
  { id: 14, slug: "maruti-ciaz", name: "Maruti Ciaz", brand: "Maruti Suzuki", model: "Ciaz", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-3344", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "20 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2400, rate_24h: 4000, hourly_rate: 240, weekend_rate_24h: 4050, deposit: 2500, late_fee_per_hour: 180, total_units: 1, available_units: 1, description: "Spacious premium sedan for highway trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-ciaz.jpg"], primary_photo: "/vehicles/maruti-ciaz.jpg" },
  { id: 15, slug: "maruti-ertiga-7-seater", name: "Maruti Ertiga 7 Seater", brand: "Maruti Suzuki", model: "Ertiga", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-5566", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 7, mileage: "19 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2800, rate_24h: 4500, hourly_rate: 280, weekend_rate_24h: 4550, deposit: 3000, late_fee_per_hour: 200, total_units: 1, available_units: 1, description: "Spacious 7-seater MPV for family trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-ertiga.avif"], primary_photo: "/vehicles/maruti-ertiga.avif" },
  { id: 16, slug: "mahindra-thar-manual", name: "Mahindra Thar 4x4", brand: "Mahindra", model: "Thar", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-9999", cc: 2184, fuel_type: "Diesel", transmission: "Manual", seats: 4, mileage: "15 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 3000, rate_24h: 5000, hourly_rate: 300, weekend_rate_24h: 5500, deposit: 3000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Iconic 4x4 SUV for offroad exploration.", terms: null, status: "available", active: 1, photos: ["/vehicles/mahindra-thar.avif"], primary_photo: "/vehicles/mahindra-thar.avif" },

  // Tempo Traveller (Category 4)
  { id: 18, slug: "tempo-traveller-12", name: "Tempo Traveller — Sakleshpura Sightseeing", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, category_name: "Tempo Traveller", category_kind: "van", category_slug: "tempo-traveller", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-V-1212", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Chauffeur driven 12 seater for day trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/tempo-traveller.jpg"], primary_photo: "/vehicles/tempo-traveller.jpg" },
  { id: 19, slug: "tempo-traveller-2days", name: "Tempo Traveller — Sakleshpura & Chikmagalur (2 Days)", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, category_name: "Tempo Traveller", category_kind: "van", category_slug: "tempo-traveller", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-V-1213", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Chauffeur driven 12 seater for 2-day hill station tours.", terms: null, status: "available", active: 1, photos: ["/vehicles/cta-tempo-banner.jpg"], primary_photo: "/vehicles/cta-tempo-banner.jpg" },
];

export function getVehicles(filters: VehicleFilters = {}, onlyActive = true): Vehicle[] {
  try {
    const db = getDb();
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (onlyActive) clauses.push("v.active = 1");
    if (filters.categorySlug) {
      clauses.push("c.slug = ?");
      params.push(filters.categorySlug);
    }
    if (filters.kind) {
      clauses.push("c.kind = ?");
      params.push(filters.kind);
    }
    if (filters.minSeats) {
      clauses.push("v.seats >= ?");
      params.push(filters.minSeats);
    }
    if (filters.transmission) {
      clauses.push("v.transmission = ?");
      params.push(filters.transmission);
    }
    if (filters.fuelType) {
      clauses.push("v.fuel_type = ?");
      params.push(filters.fuelType);
    }
    if (filters.maxPrice) {
      clauses.push("v.rate_24h <= ?");
      params.push(filters.maxPrice);
    }
    if (filters.onlyAvailable) {
      clauses.push("v.status = 'available'");
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT v.*, c.name AS category_name, c.kind AS category_kind, c.slug AS category_slug, b.name AS branch_name
         FROM vehicles v
         LEFT JOIN vehicle_categories c ON c.id = v.category_id
         LEFT JOIN branches b ON b.id = v.branch_id
         ${where}
         ORDER BY v.rate_24h ASC`
      )
      .all(...params) as Array<Record<string, unknown>>;
    if (rows && rows.length > 0) {
      return rows.map(attachPhotos);
    }
  } catch (err: any) {
    console.warn("getVehicles SQLite error:", err?.message || err);
  }
  return FALLBACK_VEHICLES;
}

export function getVehicle(slug: string): Vehicle | null {
  try {
    const row = getDb()
      .prepare(
        `SELECT v.*, c.name AS category_name, c.kind AS category_kind, c.slug AS category_slug, b.name AS branch_name
         FROM vehicles v
         LEFT JOIN vehicle_categories c ON c.id = v.category_id
         LEFT JOIN branches b ON b.id = v.branch_id
         WHERE v.slug = ? AND v.active = 1`
      )
      .get(slug) as Record<string, unknown> | undefined;
    if (row) return attachPhotos(row);
  } catch {}
  return getVehicles().find((v) => v.slug === slug) ?? null;
}

export function getVehicleById(idOrSlug: number | string): Vehicle | null {
  try {
    const num = Number(idOrSlug);
    const row = getDb()
      .prepare(
        `SELECT v.*, c.name AS category_name, c.kind AS category_kind, c.slug AS category_slug, b.name AS branch_name
         FROM vehicles v
         LEFT JOIN vehicle_categories c ON c.id = v.category_id
         LEFT JOIN branches b ON b.id = v.branch_id
         WHERE v.id = ? OR v.slug = ? OR v.registration_no = ?`
      )
      .get(num || 0, String(idOrSlug), String(idOrSlug)) as Record<string, unknown> | undefined;
    if (row) return attachPhotos(row);
  } catch {}
  const numId = Number(idOrSlug);
  return getVehicles({}, false).find((v) => v.id === numId || v.slug === String(idOrSlug)) ?? null;
}

export function getBranches(onlyActive = true): Branch[] {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM branches ${onlyActive ? "WHERE active = 1" : ""} ORDER BY name`)
      .all() as Array<Record<string, unknown>>;
    if (rows && rows.length > 0) return rows.map((r) => ({ ...r })) as unknown as Branch[];
  } catch {}
  return [{ id: 1, name: "Sakleshpura Main Branch", city: "Sakleshpura", address: "BM Road, Sakleshpura", phone: "+91 94801 23456", active: 1 }];
}

export function getTestimonials(): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM testimonials WHERE active = 1 ORDER BY sort, id DESC").all() as Array<Record<string, unknown>>;
}

export function getGallery(): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM gallery WHERE active = 1 ORDER BY sort, id DESC").all() as Array<Record<string, unknown>>;
}

export function getFaqs(): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM faqs WHERE active = 1 ORDER BY sort, id").all() as Array<Record<string, unknown>>;
}

export function getBlogPosts(publishedOnly = true): Array<Record<string, unknown>> {
  return getDb()
    .prepare(`SELECT id, slug, title, excerpt, author, created_at FROM blog_posts ${publishedOnly ? "WHERE published = 1" : ""} ORDER BY created_at DESC`)
    .all() as Array<Record<string, unknown>>;
}

export function getBlogPost(slug: string): Record<string, unknown> | null {
  const row = getDb().prepare("SELECT * FROM blog_posts WHERE slug = ? AND published = 1").get(slug) as Record<string, unknown> | undefined;
  return row ?? null;
}

export function getStaff(): Array<{ id: number; name: string; email: string; role: string; phone: string | null; is_active: number }> {
  return (getDb()
    .prepare("SELECT id, name, email, role, phone, is_active FROM users WHERE is_active = 1 ORDER BY role, name")
    .all() as Array<Record<string, unknown>>).map((r) => ({ ...r })) as Array<{ id: number; name: string; email: string; role: string; phone: string | null; is_active: number }>;
}

export function getActiveTermsVersion(): { id: number; version: number; content: string[] } | null {
  const row = getDb().prepare("SELECT * FROM terms_versions WHERE active = 1 ORDER BY version DESC LIMIT 1").get() as
    | { id: number; version: number; content: string }
    | undefined;
  if (!row) return null;
  try {
    return { id: row.id, version: row.version, content: JSON.parse(row.content) as string[] };
  } catch {
    return { id: row.id, version: row.version, content: [] };
  }
}

// ---- Redis Caching Layer Wrappers ----
import { cacheGet, cacheSet } from "./redis";

export async function getVehiclesCached(filters: VehicleFilters = {}, onlyActive = true): Promise<Vehicle[]> {
  const cacheKey = `vehicles:${JSON.stringify(filters)}:${onlyActive}`;
  const cached = await cacheGet<Vehicle[]>(cacheKey);
  if (cached) return cached;

  const fresh = getVehicles(filters, onlyActive);
  await cacheSet(cacheKey, fresh, 600);
  return fresh;
}

export async function getVehicleCategoriesCached(onlyActive = true): Promise<VehicleCategory[]> {
  const cacheKey = `vehicle_categories:${onlyActive}`;
  const cached = await cacheGet<VehicleCategory[]>(cacheKey);
  if (cached) return cached;

  const fresh = getVehicleCategories(onlyActive);
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}

export async function getTestimonialsCached(): Promise<Array<Record<string, unknown>>> {
  const cacheKey = "testimonials:active";
  const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKey);
  if (cached) return cached;

  const fresh = getTestimonials();
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}

export async function getFaqsCached(): Promise<Array<Record<string, unknown>>> {
  const cacheKey = "faqs:active";
  const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKey);
  if (cached) return cached;

  const fresh = getFaqs();
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}
