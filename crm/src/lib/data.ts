/**
 * Read models for CRM content: fleet, categories, branches and website content.
 *
 * Every read goes straight to Supabase. There is no local mirror and no hardcoded
 * fallback inventory: the previous version answered a failed query with a canned
 * seventeen-vehicle array, so an unreachable database looked exactly like a healthy
 * one — right down to prices customers could book against. A read that fails now
 * throws, and the dashboard error boundary shows it.
 */

import { sbSelect, sbSelectOne, num } from "./supabase-rest";

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

/** A booking in one of these states is holding a unit, so it reduces availability. */
const HOLDING_STATUSES = [
  "Confirmed",
  "Vehicle handed over",
  "Active rental",
  "Pending verification",
  "Enquiry",
  "Draft",
];

/** Builds a PostgREST `in.(…)` predicate; values are quoted so spaces survive. */
function inList(values: Array<string | number>): string {
  return `in.(${values.map((v) => (typeof v === "number" ? String(v) : `"${v}"`)).join(",")})`;
}

type RawVehicle = Record<string, unknown> & {
  id: number;
  vehicle_categories?: { name: string; kind: string; slug: string } | null;
  branches?: { name: string } | null;
};

const VEHICLE_EMBED = "*,vehicle_categories(name,kind,slug),branches(name)";
const VEHICLE_EMBED_INNER = "*,vehicle_categories!inner(name,kind,slug),branches(name)";

/**
 * Attaches photos and live availability to raw vehicle rows.
 *
 * Batched deliberately: the SQLite version ran two queries per vehicle, which over
 * HTTP would be forty round trips to render the fleet page.
 */
async function hydrateVehicles(rows: RawVehicle[]): Promise<Vehicle[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const idPredicate = encodeURIComponent(inList(ids));
  const nowIso = new Date().toISOString();

  const [photosRes, holdsRes] = await Promise.all([
    sbSelect<{ vehicle_id: number; url: string }>(
      "vehicle_photos",
      `select=vehicle_id,url&vehicle_id=${idPredicate}&order=is_primary.desc,sort.asc`
    ),
    sbSelect<{ vehicle_id: number }>(
      "bookings",
      `select=vehicle_id&vehicle_id=${idPredicate}&status=${encodeURIComponent(inList(HOLDING_STATUSES))}&return_at=gte.${encodeURIComponent(nowIso)}`
    ),
  ]);

  if (!photosRes.ok) throw new Error(`Could not load vehicle photos: ${photosRes.error}`);
  if (!holdsRes.ok) throw new Error(`Could not load vehicle availability: ${holdsRes.error}`);

  const photosByVehicle = new Map<number, string[]>();
  for (const photo of photosRes.data) {
    const list = photosByVehicle.get(Number(photo.vehicle_id)) ?? [];
    list.push(photo.url);
    photosByVehicle.set(Number(photo.vehicle_id), list);
  }

  const holdsByVehicle = new Map<number, number>();
  for (const hold of holdsRes.data) {
    const key = Number(hold.vehicle_id);
    holdsByVehicle.set(key, (holdsByVehicle.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const id = Number(row.id);
    const slug = String(row.slug ?? "");
    const fallbackPhoto = DEFAULT_SLUG_PHOTOS[slug] || "/vehicles/baleno-manual.avif";
    const photoUrls = photosByVehicle.get(id) ?? [];
    const photos = photoUrls.length > 0 ? photoUrls : [fallbackPhoto];

    const totalUnits = num(row.total_units, 1);
    const availableUnits = Math.max(0, totalUnits - (holdsByVehicle.get(id) ?? 0));

    // PostgREST hands back NUMERIC as a string. Without num() every one of these
    // becomes string concatenation the moment a quote is calculated.
    const baseRate24h = num(row.rate_24h);
    const weekendRate24h = Math.max(baseRate24h + 50, num(row.weekend_rate_24h, baseRate24h + 50));

    const { vehicle_categories: category, branches: branch, ...rest } = row;

    return {
      ...(rest as unknown as Vehicle),
      id,
      slug,
      category_id: row.category_id === null || row.category_id === undefined ? null : Number(row.category_id),
      category_name: category?.name ?? null,
      category_kind: category?.kind ?? null,
      category_slug: category?.slug ?? null,
      branch_id: row.branch_id === null || row.branch_id === undefined ? null : Number(row.branch_id),
      branch_name: branch?.name ?? null,
      year: row.year === null || row.year === undefined ? null : Number(row.year),
      cc: row.cc === null || row.cc === undefined ? null : Number(row.cc),
      seats: num(row.seats, 2),
      included_km: num(row.included_km, 100),
      extra_km_rate: num(row.extra_km_rate),
      rate_12h: num(row.rate_12h),
      rate_24h: baseRate24h,
      hourly_rate: num(row.hourly_rate),
      weekend_rate_24h: weekendRate24h,
      deposit: num(row.deposit),
      late_fee_per_hour: num(row.late_fee_per_hour),
      total_units: totalUnits,
      available_units: availableUnits,
      active: num(row.active, 1),
      photos,
      primary_photo: photos[0] ?? fallbackPhoto,
    };
  });
}

export async function getVehicleCategories(onlyActive = true): Promise<VehicleCategory[]> {
  const res = await sbSelect<VehicleCategory>(
    "vehicle_categories",
    `select=*${onlyActive ? "&active=eq.1" : ""}&order=sort.asc,name.asc`
  );
  if (!res.ok) throw new Error(`Could not load vehicle categories: ${res.error}`);
  return res.data.map((row) => ({ ...row, active: num(row.active, 1), sort: num(row.sort) }));
}

export async function getVehicleCategory(slug: string): Promise<VehicleCategory | null> {
  const res = await sbSelectOne<VehicleCategory>(
    "vehicle_categories",
    `select=*&slug=eq.${encodeURIComponent(slug)}&active=eq.1`
  );
  if (!res.ok) throw new Error(`Could not load vehicle category "${slug}": ${res.error}`);
  if (!res.data) return null;
  return { ...res.data, active: num(res.data.active, 1), sort: num(res.data.sort) };
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

export async function getVehicles(filters: VehicleFilters = {}, onlyActive = true): Promise<Vehicle[]> {
  // Filtering on an embedded table requires an inner join, but forcing one
  // unconditionally would hide every vehicle whose category was deleted.
  const needsCategoryJoin = Boolean(filters.categorySlug || filters.kind);
  const parts = [`select=${needsCategoryJoin ? VEHICLE_EMBED_INNER : VEHICLE_EMBED}`];

  if (onlyActive) parts.push("active=eq.1");
  if (filters.categorySlug) parts.push(`vehicle_categories.slug=eq.${encodeURIComponent(filters.categorySlug)}`);
  if (filters.kind) parts.push(`vehicle_categories.kind=eq.${encodeURIComponent(filters.kind)}`);
  if (filters.minSeats) parts.push(`seats=gte.${filters.minSeats}`);
  if (filters.transmission) parts.push(`transmission=eq.${encodeURIComponent(filters.transmission)}`);
  if (filters.fuelType) parts.push(`fuel_type=eq.${encodeURIComponent(filters.fuelType)}`);
  if (filters.maxPrice) parts.push(`rate_24h=lte.${filters.maxPrice}`);
  if (filters.onlyAvailable) parts.push("status=eq.available");
  parts.push("order=rate_24h.asc");

  const res = await sbSelect<RawVehicle>("vehicles", parts.join("&"));
  if (!res.ok) throw new Error(`Could not load vehicles: ${res.error}`);
  return hydrateVehicles(res.data);
}

export async function getVehicle(slug: string): Promise<Vehicle | null> {
  const res = await sbSelect<RawVehicle>(
    "vehicles",
    `select=${VEHICLE_EMBED}&slug=eq.${encodeURIComponent(slug)}&active=eq.1&limit=1`
  );
  if (!res.ok) throw new Error(`Could not load vehicle "${slug}": ${res.error}`);
  const hydrated = await hydrateVehicles(res.data);
  return hydrated[0] ?? null;
}

export async function getVehicleById(idOrSlug: number | string): Promise<Vehicle | null> {
  const asText = String(idOrSlug);
  const asNumber = Number(idOrSlug);

  // `id.eq.<non-numeric>` is a hard PostgREST error, so only ask about the id
  // column when the input could actually be one.
  const predicates = [`slug.eq.${asText}`, `registration_no.eq.${asText}`];
  if (Number.isInteger(asNumber) && asNumber > 0) predicates.unshift(`id.eq.${asNumber}`);

  const res = await sbSelect<RawVehicle>(
    "vehicles",
    `select=${VEHICLE_EMBED}&or=${encodeURIComponent(`(${predicates.join(",")})`)}&limit=1`
  );
  if (!res.ok) throw new Error(`Could not load vehicle "${asText}": ${res.error}`);
  const hydrated = await hydrateVehicles(res.data);
  return hydrated[0] ?? null;
}

export async function getBranches(onlyActive = true): Promise<Branch[]> {
  const res = await sbSelect<Branch>("branches", `select=*${onlyActive ? "&active=eq.1" : ""}&order=name.asc`);
  if (!res.ok) throw new Error(`Could not load branches: ${res.error}`);
  return res.data.map((row) => ({ ...row, active: num(row.active, 1) }));
}

export async function getTestimonials(): Promise<Array<Record<string, unknown>>> {
  const res = await sbSelect("testimonials", "select=*&active=eq.1&order=sort.asc,id.desc");
  if (!res.ok) throw new Error(`Could not load testimonials: ${res.error}`);
  return res.data;
}

export async function getGallery(): Promise<Array<Record<string, unknown>>> {
  const res = await sbSelect("gallery", "select=*&active=eq.1&order=sort.asc,id.desc");
  if (!res.ok) throw new Error(`Could not load gallery: ${res.error}`);
  return res.data;
}

export async function getFaqs(): Promise<Array<Record<string, unknown>>> {
  const res = await sbSelect("faqs", "select=*&active=eq.1&order=sort.asc,id.asc");
  if (!res.ok) throw new Error(`Could not load FAQs: ${res.error}`);
  return res.data;
}

export async function getBlogPosts(publishedOnly = true): Promise<Array<Record<string, unknown>>> {
  const res = await sbSelect(
    "blog_posts",
    `select=id,slug,title,excerpt,author,created_at${publishedOnly ? "&published=eq.1" : ""}&order=created_at.desc`
  );
  if (!res.ok) throw new Error(`Could not load blog posts: ${res.error}`);
  return res.data;
}

export async function getBlogPost(slug: string): Promise<Record<string, unknown> | null> {
  const res = await sbSelectOne("blog_posts", `select=*&slug=eq.${encodeURIComponent(slug)}&published=eq.1`);
  if (!res.ok) throw new Error(`Could not load blog post "${slug}": ${res.error}`);
  return res.data;
}

export type StaffMember = { id: number; name: string; email: string; role: string; phone: string | null; is_active: number };

export async function getStaff(): Promise<StaffMember[]> {
  const res = await sbSelect<StaffMember>(
    "users",
    "select=id,name,email,role,phone,is_active&is_active=eq.1&order=role.asc,name.asc"
  );
  if (!res.ok) throw new Error(`Could not load staff: ${res.error}`);
  return res.data.map((row) => ({ ...row, id: Number(row.id), is_active: num(row.is_active, 1) }));
}

export async function getActiveTermsVersion(): Promise<{ id: number; version: number; content: string[] } | null> {
  const res = await sbSelectOne<{ id: number; version: number; content: string }>(
    "terms_versions",
    "select=id,version,content&active=eq.1&order=version.desc"
  );
  if (!res.ok) throw new Error(`Could not load terms: ${res.error}`);
  if (!res.data) return null;

  const row = res.data;
  try {
    return { id: Number(row.id), version: Number(row.version), content: JSON.parse(row.content) as string[] };
  } catch {
    return { id: Number(row.id), version: Number(row.version), content: [] };
  }
}

// ---- Redis Caching Layer Wrappers ----
import { cacheGet, cacheSet } from "./redis";

export async function getVehiclesCached(filters: VehicleFilters = {}, onlyActive = true): Promise<Vehicle[]> {
  const cacheKey = `vehicles:${JSON.stringify(filters)}:${onlyActive}`;
  const cached = await cacheGet<Vehicle[]>(cacheKey);
  if (cached) return cached;

  const fresh = await getVehicles(filters, onlyActive);
  await cacheSet(cacheKey, fresh, 600);
  return fresh;
}

export async function getVehicleCategoriesCached(onlyActive = true): Promise<VehicleCategory[]> {
  const cacheKey = `vehicle_categories:${onlyActive}`;
  const cached = await cacheGet<VehicleCategory[]>(cacheKey);
  if (cached) return cached;

  const fresh = await getVehicleCategories(onlyActive);
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}

export async function getTestimonialsCached(): Promise<Array<Record<string, unknown>>> {
  const cacheKey = "testimonials:active";
  const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKey);
  if (cached) return cached;

  const fresh = await getTestimonials();
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}

export async function getFaqsCached(): Promise<Array<Record<string, unknown>>> {
  const cacheKey = "faqs:active";
  const cached = await cacheGet<Array<Record<string, unknown>>>(cacheKey);
  if (cached) return cached;

  const fresh = await getFaqs();
  await cacheSet(cacheKey, fresh, 3600);
  return fresh;
}
