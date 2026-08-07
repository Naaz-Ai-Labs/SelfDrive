import { cache } from "react";
import { gatewayGet, gatewayPost } from "./gateway";

export type VehicleCategory = {
  id: number; slug: string; name: string; kind: "bike" | "scooter" | "car" | "van";
  icon: string | null; image: string | null; short_desc: string | null; description: string | null; active: number; sort: number;
};

export type Vehicle = {
  id: number; slug: string; name: string; brand: string; model: string; year: number | null;
  category_id: number | null; category_name: string | null; category_kind: string | null; category_slug: string | null;
  branch_id: number | null; branch_name: string | null; registration_no: string | null; cc: number | null;
  fuel_type: string; transmission: string; seats: number; mileage: string | null; included_km: number;
  extra_km_rate: number; rate_12h: number; rate_24h: number; hourly_rate: number; weekend_rate_24h: number | null;
  deposit: number; late_fee_per_hour: number; total_units: number; available_units?: number; description: string | null; terms: string | null; status: string;
  active: number; photos: string[]; primary_photo: string | null;
};

export type Branch = { id: number; name: string; city: string | null; address: string | null; phone: string | null; active: number };

type Content = {
  business: Record<string, unknown>;
  rentalRules: Record<string, unknown>;
  categories: VehicleCategory[];
  vehicles: Vehicle[];
  testimonials: Array<Record<string, unknown>>;
  gallery: Array<Record<string, unknown>>;
  faqs: Array<Record<string, unknown>>;
  staff: Array<{ id: number; name: string; email: string; role: string; phone: string | null; is_active: number }>;
  terms: { id: number; version: number; content: string[] } | null;
  blogPosts: Array<Record<string, unknown>>;
  branches: Branch[];
};

const FALLBACK_CATEGORIES: VehicleCategory[] = [
  { id: 1, slug: "cars", name: "Cars", kind: "car", icon: null, image: "/vehicles/mahindra-thar.avif", short_desc: "Self-drive hatchbacks, sedans & SUVs", description: "Well maintained self-drive car fleet.", active: 1, sort: 1 },
  { id: 2, slug: "bikes", name: "Bikes", kind: "bike", icon: null, image: "/vehicles/tvs-ronin.avif", short_desc: "Cruisers and commuter bikes", description: "Well-serviced bikes for trips.", active: 1, sort: 2 },
  { id: 3, slug: "scooters", name: "Scooters", kind: "scooter", icon: null, image: "/vehicles/category-scooters.jpg", short_desc: "Automatic scooters for local travel", description: "Simple automatic scooters.", active: 1, sort: 3 },
  { id: 4, slug: "tempo-traveller", name: "Tempo Traveller", kind: "van", icon: null, image: "/vehicles/tempo-traveller.jpg", short_desc: "Chauffeur driven tempo traveller", description: "Group sightseeing trips.", active: 1, sort: 4 },
];

const FALLBACK_VEHICLES: Vehicle[] = [
  { id: 1, slug: "honda-dio", name: "Honda Dio", brand: "Honda", model: "Dio", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-1234", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Light, easy-to-ride scooter.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-dio.avif"], primary_photo: "/vehicles/honda-dio.avif" },
  { id: 2, slug: "honda-activa", name: "Honda Activa 6G", brand: "Honda", model: "Activa 6G", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-5678", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 4, available_units: 4, description: "Automatic, light and simple to ride.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-activa.webp"], primary_photo: "/vehicles/honda-activa.webp" },
  { id: 3, slug: "tvs-ronin", name: "TVS Ronin 225", brand: "TVS", model: "Ronin", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-9012", cc: 225, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1800, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Modern cruiser styling.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-ronin.avif"], primary_photo: "/vehicles/tvs-ronin.avif" },
  { id: 4, slug: "honda-cb200x", name: "Honda CB200X", brand: "Honda", model: "CB200X", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-3456", cc: 184, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "38 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1800, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Adventure-styled bike.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-cb200x.jpg"], primary_photo: "/vehicles/honda-cb200x.jpg" },
  { id: 5, slug: "maruti-baleno", name: "Maruti Baleno Manual", brand: "Maruti Suzuki", model: "Baleno", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-7890", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "21 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3500, deposit: 2000, late_fee_per_hour: 150, total_units: 2, available_units: 2, description: "Comfortable premium hatchback.", terms: null, status: "available", active: 1, photos: ["/vehicles/baleno-manual.avif"], primary_photo: "/vehicles/baleno-manual.avif" },
  { id: 6, slug: "mahindra-thar", name: "Mahindra Thar 4x4", brand: "Mahindra", model: "Thar", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-9999", cc: 2184, fuel_type: "Diesel", transmission: "Manual", seats: 4, mileage: "15 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 3000, rate_24h: 5000, hourly_rate: 300, weekend_rate_24h: 5500, deposit: 3000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Iconic 4x4 SUV for offroad exploration.", terms: null, status: "available", active: 1, photos: ["/vehicles/mahindra-thar.avif"], primary_photo: "/vehicles/mahindra-thar.avif" },
  { id: 7, slug: "tempo-traveller-12", name: "Force Tempo Traveller (12 Seater)", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, category_name: "Tempo Traveller", category_kind: "van", category_slug: "tempo-traveller", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-V-1212", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12000, deposit: 2000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Chauffeur driven 12 seater.", terms: null, status: "available", active: 1, photos: ["/vehicles/tempo-traveller.jpg"], primary_photo: "/vehicles/tempo-traveller.jpg" },
];

const EMPTY_CONTENT: Content = {
  business: {}, rentalRules: {}, categories: FALLBACK_CATEGORIES, vehicles: FALLBACK_VEHICLES, testimonials: [], gallery: [], faqs: [], staff: [], terms: null, blogPosts: [], branches: [],
};

/** Fetched once per request (React cache dedupes repeated calls within the same render
 * pass) — the CRM gateway returns the whole read-mostly content model in one payload, so
 * a page that needs categories, vehicles and testimonials makes one network round trip. */
export const getContent = cache(async (): Promise<Content> => {
  const data = await gatewayGet<Content & { error?: string }>("/api/gateway/v1/content", { revalidate: 0 });
  if (!data || "error" in data || !Array.isArray(data.vehicles) || data.vehicles.length === 0) {
    return { ...EMPTY_CONTENT, ...(data && !("error" in data) ? data : {}), categories: data?.categories?.length ? data.categories : FALLBACK_CATEGORIES, vehicles: data?.vehicles?.length ? data.vehicles : FALLBACK_VEHICLES };
  }
  return data;
});

export async function getVehicleCategories(): Promise<VehicleCategory[]> {
  return (await getContent()).categories;
}

export async function getVehicleCategory(slug: string): Promise<VehicleCategory | null> {
  return (await getContent()).categories.find((c) => c.slug === slug) ?? null;
}

export type VehicleFilters = { categorySlug?: string; kind?: string };

export async function getVehicles(filters: VehicleFilters = {}): Promise<Vehicle[]> {
  const { vehicles } = await getContent();
  return vehicles.filter((v) => (!filters.kind || v.category_kind === filters.kind) && (!filters.categorySlug || v.category_slug === filters.categorySlug));
}

export async function getVehicle(slug: string): Promise<Vehicle | null> {
  return (await getContent()).vehicles.find((v) => v.slug === slug) ?? null;
}

export async function getVehicleById(id: number): Promise<Vehicle | null> {
  return (await getContent()).vehicles.find((v) => v.id === id) ?? null;
}

export async function getTestimonials() {
  return (await getContent()).testimonials;
}

export async function getGallery() {
  return (await getContent()).gallery;
}

export async function getFaqs() {
  return (await getContent()).faqs;
}

export async function getStaff() {
  return (await getContent()).staff;
}

export async function getActiveTermsVersion() {
  return (await getContent()).terms;
}

export async function getBranches(): Promise<Branch[]> {
  return (await getContent()).branches;
}

export async function getBlogPosts() {
  return (await getContent()).blogPosts;
}

export async function getBlogPost(slug: string): Promise<Record<string, unknown> | null> {
  const res = await gatewayPost<{ post: Record<string, unknown> | null }>("/api/gateway/v1/content", { op: "blogPost", slug });
  return res?.post ?? null;
}
