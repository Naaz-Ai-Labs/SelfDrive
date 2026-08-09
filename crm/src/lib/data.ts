import { getDb } from "./db";

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

function attachPhotos(vehicle: Record<string, unknown>): Vehicle {
  const db = getDb();
  const photos = db
    .prepare("SELECT url FROM vehicle_photos WHERE vehicle_id = ? ORDER BY is_primary DESC, sort")
    .all(vehicle.id as number) as Array<{ url: string }>;

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

  return {
    ...(vehicle as unknown as Vehicle),
    total_units: totalUnits,
    available_units: availableUnits,
    photos: photos.map((p) => p.url),
    primary_photo: photos[0]?.url ?? null,
  };
}

export function getVehicleCategories(onlyActive = true): VehicleCategory[] {
  const rows = getDb()
    .prepare(`SELECT * FROM vehicle_categories ${onlyActive ? "WHERE active = 1" : ""} ORDER BY sort, name`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...r })) as unknown as VehicleCategory[];
}

export function getVehicleCategory(slug: string): VehicleCategory | null {
  const row = getDb().prepare("SELECT * FROM vehicle_categories WHERE slug = ? AND active = 1").get(slug) as VehicleCategory | undefined;
  return row ?? null;
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

export function getVehicles(filters: VehicleFilters = {}, onlyActive = true): Vehicle[] {
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
  return rows.map(attachPhotos);
}

export function getVehicle(slug: string): Vehicle | null {
  const row = getDb()
    .prepare(
      `SELECT v.*, c.name AS category_name, c.kind AS category_kind, c.slug AS category_slug, b.name AS branch_name
       FROM vehicles v
       LEFT JOIN vehicle_categories c ON c.id = v.category_id
       LEFT JOIN branches b ON b.id = v.branch_id
       WHERE v.slug = ? AND v.active = 1`
    )
    .get(slug) as Record<string, unknown> | undefined;
  if (!row) return null;
  return attachPhotos(row);
}

export function getVehicleById(id: number): Vehicle | null {
  const row = getDb()
    .prepare(
      `SELECT v.*, c.name AS category_name, c.kind AS category_kind, c.slug AS category_slug, b.name AS branch_name
       FROM vehicles v
       LEFT JOIN vehicle_categories c ON c.id = v.category_id
       LEFT JOIN branches b ON b.id = v.branch_id
       WHERE v.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return attachPhotos(row);
}

export function getBranches(onlyActive = true): Branch[] {
  const rows = getDb()
    .prepare(`SELECT * FROM branches ${onlyActive ? "WHERE active = 1" : ""} ORDER BY name`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...r })) as unknown as Branch[];
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
