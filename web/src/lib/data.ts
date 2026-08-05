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

const EMPTY_CONTENT: Content = {
  business: {}, rentalRules: {}, categories: [], vehicles: [], testimonials: [], gallery: [], faqs: [], staff: [], terms: null, blogPosts: [], branches: [],
};

/** Fetched once per request (React cache dedupes repeated calls within the same render
 * pass) — the CRM gateway returns the whole read-mostly content model in one payload, so
 * a page that needs categories, vehicles and testimonials makes one network round trip. */
export const getContent = cache(async (): Promise<Content> => {
  const data = await gatewayGet<Content & { error?: string }>("/api/gateway/v1/content", { revalidate: 0 });
  if (!data || "error" in data) return EMPTY_CONTENT;
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
