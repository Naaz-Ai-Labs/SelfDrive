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
  // Scooters (Category 3) — 16 units
  { id: 1, slug: "honda-dio", name: "Honda Dio", brand: "Honda", model: "Dio", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-1234", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 4, available_units: 4, description: "Light, easy-to-ride scooter.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-dio.avif"], primary_photo: "/vehicles/honda-dio.avif" },
  { id: 2, slug: "honda-activa", name: "Honda Activa 6G", brand: "Honda", model: "Activa 6G", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-5678", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Automatic, light and simple to ride.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-activa.webp"], primary_photo: "/vehicles/honda-activa.webp" },
  { id: 3, slug: "tvs-jupiter", name: "TVS Jupiter", brand: "TVS", model: "Jupiter", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-9012", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 4, available_units: 4, description: "Smooth ride with high comfort.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-jupiter.webp"], primary_photo: "/vehicles/tvs-jupiter.webp" },
  { id: 4, slug: "yamaha-rayzr", name: "Yamaha RayZR", brand: "Yamaha", model: "RayZR", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-3456", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "52 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 550, rate_24h: 950, hourly_rate: 100, weekend_rate_24h: 1000, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Sporty 125cc scooter.", terms: null, status: "available", active: 1, photos: ["/vehicles/yamaha-rayzr.avif"], primary_photo: "/vehicles/yamaha-rayzr.avif" },
  { id: 5, slug: "tvs-ntorq", name: "TVS NTorq 125", brand: "TVS", model: "NTorq", year: 2023, category_id: 3, category_name: "Scooters", category_kind: "scooter", category_slug: "scooters", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-E-7890", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 110, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 3, available_units: 3, description: "Performance scooter with bluetooth console.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-ntorq.webp"], primary_photo: "/vehicles/tvs-ntorq.webp" },

  // Bikes (Category 2) — 9 units
  { id: 6, slug: "tvs-ronin", name: "TVS Ronin 225", brand: "TVS", model: "Ronin", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-9012", cc: 225, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Modern cruiser styling.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-ronin.avif"], primary_photo: "/vehicles/tvs-ronin.avif" },
  { id: 7, slug: "honda-cb200x", name: "Honda CB200X", brand: "Honda", model: "CB200X", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-3456", cc: 184, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "38 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, available_units: 2, description: "Adventure-styled bike.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-cb200x.jpg"], primary_photo: "/vehicles/honda-cb200x.jpg" },
  { id: 8, slug: "tvs-raider", name: "TVS Raider 125", brand: "TVS", model: "Raider", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-1122", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 700, rate_24h: 1200, hourly_rate: 110, weekend_rate_24h: 1250, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Sleek commuter bike.", terms: null, status: "available", active: 1, photos: ["/vehicles/tvs-radar.avif"], primary_photo: "/vehicles/tvs-radar.avif" },
  { id: 9, slug: "bajaj-pulsar-ns", name: "Bajaj Pulsar NS200", brand: "Bajaj", model: "Pulsar NS", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-3344", cc: 200, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 800, rate_24h: 1300, hourly_rate: 120, weekend_rate_24h: 1350, deposit: 1000, late_fee_per_hour: 100, total_units: 1, available_units: 1, description: "Naked streetfighter performance.", terms: null, status: "available", active: 1, photos: ["/vehicles/bajaj-pulsar-ns.png"], primary_photo: "/vehicles/bajaj-pulsar-ns.png" },
  { id: 10, slug: "honda-shine", name: "Honda Shine 125", brand: "Honda", model: "Shine", year: 2023, category_id: 2, category_name: "Bikes", category_kind: "bike", category_slug: "bikes", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-M-5566", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 100, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 2, available_units: 2, description: "Reliable and comfortable commuter.", terms: null, status: "available", active: 1, photos: ["/vehicles/honda-shine.avif"], primary_photo: "/vehicles/honda-shine.avif" },

  // Cars (Category 1) — 7 units
  { id: 11, slug: "maruti-baleno-manual", name: "Maruti Suzuki Baleno", brand: "Maruti Suzuki", model: "Baleno", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-7890", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "21 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 2, available_units: 2, description: "Comfortable premium hatchback.", terms: null, status: "available", active: 1, photos: ["/vehicles/baleno-manual.avif"], primary_photo: "/vehicles/baleno-manual.avif" },
  { id: 13, slug: "maruti-dzire", name: "Maruti Dzire", brand: "Maruti Suzuki", model: "Dzire", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-1122", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "23 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 1, available_units: 1, description: "Fuel-efficient compact sedan.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-dzire.avif"], primary_photo: "/vehicles/maruti-dzire.avif" },
  { id: 14, slug: "maruti-ciaz", name: "Maruti Ciaz", brand: "Maruti Suzuki", model: "Ciaz", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-3344", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "20 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2400, rate_24h: 4000, hourly_rate: 240, weekend_rate_24h: 4050, deposit: 2500, late_fee_per_hour: 180, total_units: 1, available_units: 1, description: "Spacious premium sedan for highway trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-ciaz.jpg"], primary_photo: "/vehicles/maruti-ciaz.jpg" },
  { id: 15, slug: "maruti-ertiga-7-seater", name: "Maruti Ertiga 7 Seater", brand: "Maruti Suzuki", model: "Ertiga", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-5566", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 7, mileage: "19 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2800, rate_24h: 4500, hourly_rate: 280, weekend_rate_24h: 4550, deposit: 3000, late_fee_per_hour: 200, total_units: 1, available_units: 1, description: "Spacious 7-seater MPV for family trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/maruti-ertiga.avif"], primary_photo: "/vehicles/maruti-ertiga.avif" },
  { id: 16, slug: "mahindra-thar-manual", name: "Mahindra Thar 4x4", brand: "Mahindra", model: "Thar", year: 2023, category_id: 1, category_name: "Cars", category_kind: "car", category_slug: "cars", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-C-9999", cc: 2184, fuel_type: "Diesel", transmission: "Manual", seats: 4, mileage: "15 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 3000, rate_24h: 5000, hourly_rate: 300, weekend_rate_24h: 5500, deposit: 3000, late_fee_per_hour: 250, total_units: 2, available_units: 2, description: "Iconic 4x4 SUV for offroad exploration.", terms: null, status: "available", active: 1, photos: ["/vehicles/mahindra-thar.avif"], primary_photo: "/vehicles/mahindra-thar.avif" },

  // Tempo Traveller (Category 4) — 1 unit
  { id: 18, slug: "tempo-traveller-12", name: "Tempo Traveller — Sakleshpura Sightseeing", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, category_name: "Tempo Traveller", category_kind: "van", category_slug: "tempo-traveller", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-V-1212", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 1, available_units: 1, description: "Chauffeur driven 12 seater for day trips.", terms: null, status: "available", active: 1, photos: ["/vehicles/tempo-traveller.jpg"], primary_photo: "/vehicles/tempo-traveller.jpg" },
  { id: 19, slug: "tempo-traveller-2days", name: "Tempo Traveller — Sakleshpura & Chikmagalur (2 Days)", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, category_name: "Tempo Traveller", category_kind: "van", category_slug: "tempo-traveller", branch_id: 1, branch_name: "Sakleshpura Main Branch", registration_no: "KA-46-V-1213", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 0, available_units: 0, description: "Chauffeur driven 12 seater for 2-day hill station tours.", terms: null, status: "available", active: 1, photos: ["/vehicles/cta-tempo-banner.jpg"], primary_photo: "/vehicles/cta-tempo-banner.jpg" },
];

const FALLBACK_BLOG_POSTS: Array<Record<string, unknown>> = [
  {
    id: 1,
    slug: "sakleshpura-to-chikmagalur-self-drive-guide",
    title: "Sakleshpura to Chikmagalur: A Self-Drive Road Trip Guide",
    excerpt: "Ghat roads, coffee estates and waterfalls — what to expect on the drive, and how to plan it well.",
    author: "Darshh Holiday Team",
    created_at: "2026-08-01T10:00:00Z",
    content: `The Sakleshpura–Chikmagalur stretch is one of the most rewarding short drives in the Western Ghats — coffee estates on both sides of the road, mist-covered hills for most of the year, and enough waterfalls and viewpoints to fill a full day without rushing.

Budget half a day for the drive alone if you're stopping along the way, longer if you're planning a proper detour to Mullayanagiri or Baba Budangiri. The ghat sections have sharp curves and sudden weather changes, especially during monsoon (June–September), so a vehicle with good tyres and brakes matters more than horsepower here.

A few practical notes for anyone planning this on a rented vehicle: fuel up before you start, since stations thin out once you're properly into the ghat stretches. Carry your driving licence and ID with you at all times — these routes do see checkpoints. And if you're on a two-wheeler, start early; the light through the estates is best in the first few hours after sunrise, and afternoon fog can roll in fast during the wetter months.

Whether you need a nimble scooter for winding roads or a proper SUV for the whole family, book with a fixed price upfront and know exactly what your kilometre allowance covers before you leave — no surprises at the end of the trip.`
  },
  {
    id: 2,
    slug: "hassan-district-weekend-getaways",
    title: "Hassan District Weekend Getaways You Can Reach in a Day",
    excerpt: "Belur, Halebidu, Shravanabelagola and the Sakleshpura ghats — a practical weekend circuit.",
    author: "Darshh Holiday Team",
    created_at: "2026-08-03T10:00:00Z",
    content: `Hassan district packs an unusual amount into a small area — centuries-old temple towns, a hilltop Jain monolith, and some of the greenest ghat roads in Karnataka, all within a couple of hours of each other.

Belur and Halebidu are the classic pairing — Hoysala-era temple architecture, roughly 40 minutes apart, both worth a couple of unhurried hours each. Shravanabelagola, home to the Gommateshwara statue, adds another hour or so of driving but is a genuinely different kind of stop — expect some walking (and stairs) once you arrive.

If you'd rather trade temples for hills, Sakleshpura and the road toward Chikmagalur cover the other end of the district's character — coffee country, waterfalls, and long stretches where the road itself is the reason for the trip.

Either circuit works comfortably as a single day out and back, or a relaxed overnight if you want to split the driving. A compact car or scooter is enough for the temple circuit; if the ghat roads are part of your plan, a vehicle with a bit more ground clearance makes for a smoother ride.`
  },
  {
    id: 3,
    slug: "documents-needed-self-drive-rental-karnataka",
    title: "What Documents Do You Need to Rent a Self-Drive Vehicle?",
    excerpt: "A quick, practical checklist so pickup takes five minutes, not fifty.",
    author: "Darshh Holiday Team",
    created_at: "2026-08-05T10:00:00Z",
    content: `Nothing slows down a pickup more than missing paperwork, so here's the short version of what to carry.

You'll need a valid driving licence appropriate to the vehicle class — a two-wheeler licence for bikes and scooters, a valid car licence for four-wheelers. Learner's licences aren't accepted. Alongside that, bring one government-issued photo ID: Aadhaar, passport or voter ID all work.

A refundable security deposit is collected at pickup and returned after the vehicle is inspected on return, minus any deductions for damage, late return or excess kilometres — each of which is itemised, never guessed at.

A couple of things that trip people up: make sure the name on your licence matches your ID exactly, and if you're booking for someone else, the person picking up the vehicle needs to be the one whose documents are on file. Bring physical copies where possible — a photo on your phone works in a pinch, but a printed or physical ID makes verification faster.

Get this sorted before you arrive and pickup genuinely takes a few minutes — inspect the vehicle together, sign, and you're on the road.`
  }
];

const EMPTY_CONTENT: Content = {
  business: {}, rentalRules: {}, categories: FALLBACK_CATEGORIES, vehicles: FALLBACK_VEHICLES, testimonials: [], gallery: [], faqs: [], staff: [], terms: null, blogPosts: FALLBACK_BLOG_POSTS, branches: [],
};

async function fetchContentFromSupabase(): Promise<Partial<Content> | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const [
      { data: supaCategories },
      { data: supaVehicles },
      { data: supaPhotos },
      { data: supaBranches },
      { data: supaTestimonials },
      { data: supaFaqs },
      { data: supaTerms },
      { data: supaBlogPosts },
      { data: supaSettings },
    ] = await Promise.all([
      supabase.from("vehicle_categories").select("*").eq("active", 1).order("sort"),
      supabase.from("vehicles").select("*, vehicle_categories(name, kind, slug)").eq("active", 1),
      supabase.from("vehicle_photos").select("*").order("is_primary", { ascending: false }),
      supabase.from("branches").select("*").eq("active", 1),
      supabase.from("testimonials").select("*").eq("active", 1).order("sort"),
      supabase.from("faqs").select("*").eq("active", 1).order("sort"),
      supabase.from("terms_versions").select("*").eq("active", 1).order("version", { ascending: false }).limit(1),
      supabase.from("blog_posts").select("*").eq("published", 1).order("created_at", { ascending: false }),
      supabase.from("settings").select("*"),
    ]);

    if (!supaVehicles || supaVehicles.length === 0) return null;

    const photoMap = new Map<number, { photos: string[]; primary: string }>();
    if (supaPhotos) {
      for (const p of supaPhotos) {
        const photoUrl = (p as any).url || (p as any).photo_url;
        if (!photoUrl) continue;
        const entry = photoMap.get(p.vehicle_id) || { photos: [], primary: "" };
        entry.photos.push(photoUrl);
        if (p.is_primary) entry.primary = photoUrl;
        photoMap.set(p.vehicle_id, entry);
      }
    }

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

    const vehicles: Vehicle[] = supaVehicles.map((v: any) => {
      const cat = v.vehicle_categories;
      const ph = photoMap.get(v.id);
      const fallback = DEFAULT_SLUG_PHOTOS[v.slug] || "/vehicles/baleno-manual.avif";
      const vehiclePhotos = ph?.photos && ph.photos.length > 0 ? ph.photos : (Array.isArray(v.photos) ? v.photos : [fallback]);
      return {
        ...v,
        category_name: cat?.name || v.category_name || "Vehicle",
        category_kind: cat?.kind || v.category_kind || "car",
        category_slug: cat?.slug || v.category_slug || "cars",
        photos: vehiclePhotos,
        primary_photo: ph?.primary || vehiclePhotos[0] || fallback,
        available_units: v.available_units ?? v.total_units ?? 1,
        vehicle_categories: undefined,
      };
    });

    const settingsMap = new Map((supaSettings ?? []).map((s: any) => [s.key, s.value]));
    let parsedTerms: { id: number; version: number; content: string[] } | null = null;
    if (supaTerms && supaTerms.length > 0) {
      const t = supaTerms[0];
      let contentArr: string[] = [];
      try {
        contentArr = typeof t.content === "string" ? JSON.parse(t.content) : (t.content || []);
      } catch {
        contentArr = Array.isArray(t.content) ? t.content : [];
      }
      parsedTerms = { id: t.id, version: t.version, content: contentArr };
    }

    return {
      categories: (supaCategories && supaCategories.length > 0 ? supaCategories : FALLBACK_CATEGORIES) as VehicleCategory[],
      vehicles,
      branches: (supaBranches ?? []) as Branch[],
      testimonials: (supaTestimonials ?? []) as Array<Record<string, unknown>>,
      faqs: (supaFaqs ?? []) as Array<Record<string, unknown>>,
      terms: parsedTerms,
      blogPosts: (supaBlogPosts && supaBlogPosts.length > 0 ? supaBlogPosts : FALLBACK_BLOG_POSTS) as Array<Record<string, unknown>>,
      business: Object.fromEntries(settingsMap),
    };
  } catch (err) {
    console.warn("Supabase direct content query fallback exception:", err);
    return null;
  }
}

/** Fetched once per request (React cache dedupes repeated calls within the same render
 * pass) — the CRM gateway returns the whole read-mostly content model in one payload, so
 * a page that needs categories, vehicles and testimonials makes one network round trip. */
export const getContent = cache(async (): Promise<Content> => {
  try {
    const data = await gatewayGet<Content & { error?: string }>("/api/gateway/v1/content", { revalidate: 0 });
    if (data && !("error" in data) && Array.isArray(data.vehicles) && data.vehicles.length > 0) {
      return {
        ...data,
        blogPosts: data.blogPosts?.length ? data.blogPosts : FALLBACK_BLOG_POSTS,
      };
    }
  } catch (err) {
    console.warn("Gateway getContent fetch warning:", err);
  }

  // Direct Supabase Live Data Fallback
  const supaContent = await fetchContentFromSupabase();
  if (supaContent && Array.isArray(supaContent.vehicles) && supaContent.vehicles.length > 0) {
    return {
      ...EMPTY_CONTENT,
      ...supaContent,
      categories: supaContent.categories?.length ? supaContent.categories : FALLBACK_CATEGORIES,
      vehicles: supaContent.vehicles,
      blogPosts: supaContent.blogPosts?.length ? supaContent.blogPosts : FALLBACK_BLOG_POSTS,
    } as Content;
  }

  return {
    ...EMPTY_CONTENT,
    categories: FALLBACK_CATEGORIES,
    vehicles: FALLBACK_VEHICLES,
    blogPosts: FALLBACK_BLOG_POSTS,
  };
});

export async function getVehicleCategories(): Promise<VehicleCategory[]> {
  return (await getContent()).categories;
}

export async function getVehicleCategory(slug: string): Promise<VehicleCategory | null> {
  return (await getContent()).categories.find((c) => c.slug === slug) ?? null;
}

import { getDynamicRate24h } from "./pricing";

export type VehicleFilters = { categorySlug?: string; kind?: string };

export async function getVehicles(filters: VehicleFilters = {}): Promise<Vehicle[]> {
  const { vehicles } = await getContent();
  return vehicles
    .filter((v) => (!filters.kind || v.category_kind === filters.kind) && (!filters.categorySlug || v.category_slug === filters.categorySlug))
    .map((v) => {
      const baseRate = Number(v.rate_24h ?? 0);
      const weekendRate = Math.max(baseRate + 50, Number(v.weekend_rate_24h ?? (baseRate + 50)));
      return {
        ...v,
        rate_24h: baseRate,
        weekend_rate_24h: weekendRate,
      };
    });
}

export async function getVehicle(slug: string): Promise<Vehicle | null> {
  const v = (await getContent()).vehicles.find((v) => v.slug === slug) ?? null;
  if (!v) return null;
  const baseRate = Number(v.rate_24h ?? 0);
  const weekendRate = Math.max(baseRate + 50, Number(v.weekend_rate_24h ?? (baseRate + 50)));
  return {
    ...v,
    rate_24h: baseRate,
    weekend_rate_24h: weekendRate,
  };
}

export async function getVehicleById(id: number): Promise<Vehicle | null> {
  const v = (await getContent()).vehicles.find((v) => v.id === id) ?? null;
  if (!v) return null;
  const baseRate = Number(v.rate_24h ?? 0);
  const weekendRate = Math.max(baseRate + 50, Number(v.weekend_rate_24h ?? (baseRate + 50)));
  return {
    ...v,
    rate_24h: baseRate,
    weekend_rate_24h: weekendRate,
  };
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
  if (res?.post) return res.post;
  return FALLBACK_BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

