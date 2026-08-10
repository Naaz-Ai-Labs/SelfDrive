import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

function loadEnv(envPath: string) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));
loadEnv(path.join(process.cwd(), ".env"));

async function seedAllCarsToSupabase() {
  console.log("--- SEEDING ALL 7 CARS TO SUPABASE POSTGRESQL ---");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("No Supabase credentials found!");
    return;
  }

  const supabase = createClient(url, key);

  // Clear existing vehicles to avoid slug duplicate key conflicts
  await supabase.from("vehicle_photos").delete().gte("vehicle_id", 1);
  await supabase.from("vehicles").delete().gte("id", 1);

  const vehiclesToUpsert = [
    // Scooters
    { id: 1, slug: "honda-dio", name: "Honda Dio", brand: "Honda", model: "Dio", year: 2023, category_id: 3, branch_id: 1, registration_no: "KA-46-E-1234", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, description: "Light, easy-to-ride scooter.", status: "available", active: 1 },
    { id: 2, slug: "honda-activa", name: "Honda Activa 6G", brand: "Honda", model: "Activa 6G", year: 2023, category_id: 3, branch_id: 1, registration_no: "KA-46-E-5678", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 4, description: "Automatic, light and simple to ride.", status: "available", active: 1 },
    { id: 3, slug: "tvs-jupiter", name: "TVS Jupiter", brand: "TVS", model: "Jupiter", year: 2023, category_id: 3, branch_id: 1, registration_no: "KA-46-E-9012", cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 500, rate_24h: 900, hourly_rate: 100, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100, total_units: 3, description: "Smooth ride with high comfort.", status: "available", active: 1 },
    { id: 4, slug: "yamaha-rayzr", name: "Yamaha RayZR", brand: "Yamaha", model: "RayZR", year: 2023, category_id: 3, branch_id: 1, registration_no: "KA-46-E-3456", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "52 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 550, rate_24h: 950, hourly_rate: 100, weekend_rate_24h: 1000, deposit: 1000, late_fee_per_hour: 100, total_units: 2, description: "Sporty 125cc scooter.", status: "available", active: 1 },
    { id: 5, slug: "tvs-ntorq", name: "TVS NTorq 125", brand: "TVS", model: "NTorq", year: 2023, category_id: 3, branch_id: 1, registration_no: "KA-46-E-7890", cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 110, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 3, description: "Performance scooter with bluetooth console.", status: "available", active: 1 },

    // Bikes
    { id: 6, slug: "tvs-ronin", name: "TVS Ronin 225", brand: "TVS", model: "Ronin", year: 2023, category_id: 2, branch_id: 1, registration_no: "KA-46-M-9012", cc: 225, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, description: "Modern cruiser styling.", status: "available", active: 1 },
    { id: 7, slug: "honda-cb200x", name: "Honda CB200X", brand: "Honda", model: "CB200X", year: 2023, category_id: 2, branch_id: 1, registration_no: "KA-46-M-3456", cc: 184, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "38 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 1000, rate_24h: 1800, hourly_rate: 150, weekend_rate_24h: 1850, deposit: 1000, late_fee_per_hour: 120, total_units: 2, description: "Adventure-styled bike.", status: "available", active: 1 },
    { id: 8, slug: "tvs-raider", name: "TVS Raider 125", brand: "TVS", model: "Raider", year: 2023, category_id: 2, branch_id: 1, registration_no: "KA-46-M-1122", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 700, rate_24h: 1200, hourly_rate: 110, weekend_rate_24h: 1250, deposit: 1000, late_fee_per_hour: 100, total_units: 2, description: "Sleek commuter bike.", status: "available", active: 1 },
    { id: 9, slug: "bajaj-pulsar-ns", name: "Bajaj Pulsar NS200", brand: "Bajaj", model: "Pulsar NS", year: 2023, category_id: 2, branch_id: 1, registration_no: "KA-46-M-3344", cc: 200, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 800, rate_24h: 1300, hourly_rate: 120, weekend_rate_24h: 1350, deposit: 1000, late_fee_per_hour: 100, total_units: 2, description: "Naked streetfighter performance.", status: "available", active: 1 },
    { id: 10, slug: "honda-shine", name: "Honda Shine 125", brand: "Honda", model: "Shine", year: 2023, category_id: 2, branch_id: 1, registration_no: "KA-46-M-5566", cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "55 km/l", included_km: 100, extra_km_rate: 4, rate_12h: 600, rate_24h: 1000, hourly_rate: 100, weekend_rate_24h: 1050, deposit: 1000, late_fee_per_hour: 100, total_units: 2, description: "Reliable and comfortable commuter.", status: "available", active: 1 },

    // Cars (ALL 7 CARS)
    { id: 11, slug: "maruti-baleno-manual", name: "Maruti Suzuki Baleno (Manual)", brand: "Maruti Suzuki", model: "Baleno Manual", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-7890", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "21 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 2, description: "Comfortable premium manual hatchback.", status: "available", active: 1 },
    { id: 12, slug: "maruti-baleno-automatic", name: "Maruti Suzuki Baleno (Automatic)", brand: "Maruti Suzuki", model: "Baleno Automatic", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-7891", cc: 1197, fuel_type: "Petrol", transmission: "Automatic", seats: 5, mileage: "22 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2200, rate_24h: 3800, hourly_rate: 220, weekend_rate_24h: 3850, deposit: 2000, late_fee_per_hour: 150, total_units: 2, description: "Smooth automatic premium hatchback.", status: "available", active: 1 },
    { id: 13, slug: "maruti-dzire", name: "Maruti Dzire", brand: "Maruti Suzuki", model: "Dzire", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-1122", cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "23 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2000, rate_24h: 3500, hourly_rate: 200, weekend_rate_24h: 3550, deposit: 2000, late_fee_per_hour: 150, total_units: 2, description: "Fuel-efficient compact sedan.", status: "available", active: 1 },
    { id: 14, slug: "maruti-ciaz", name: "Maruti Ciaz", brand: "Maruti Suzuki", model: "Ciaz", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-3344", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "20 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2400, rate_24h: 4000, hourly_rate: 240, weekend_rate_24h: 4050, deposit: 2500, late_fee_per_hour: 180, total_units: 1, description: "Spacious premium sedan for highway trips.", status: "available", active: 1 },
    { id: 15, slug: "maruti-ertiga-7-seater", name: "Maruti Ertiga 7 Seater", brand: "Maruti Suzuki", model: "Ertiga", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-5566", cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 7, mileage: "19 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 2800, rate_24h: 4500, hourly_rate: 280, weekend_rate_24h: 4550, deposit: 3000, late_fee_per_hour: 200, total_units: 1, description: "Spacious 7-seater MPV for family trips.", status: "available", active: 1 },
    { id: 16, slug: "mahindra-thar-manual", name: "Mahindra Thar 4x4 (Manual)", brand: "Mahindra", model: "Thar Manual", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-9999", cc: 2184, fuel_type: "Diesel", transmission: "Manual", seats: 4, mileage: "15 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 3000, rate_24h: 5000, hourly_rate: 300, weekend_rate_24h: 5500, deposit: 3000, late_fee_per_hour: 250, total_units: 1, description: "Iconic 4x4 SUV for offroad exploration.", status: "available", active: 1 },
    { id: 17, slug: "mahindra-thar-automatic", name: "Mahindra Thar 4x4 (Automatic)", brand: "Mahindra", model: "Thar Automatic", year: 2023, category_id: 1, branch_id: 1, registration_no: "KA-46-C-9998", cc: 2184, fuel_type: "Diesel", transmission: "Automatic", seats: 4, mileage: "14 km/l", included_km: 300, extra_km_rate: 8, rate_12h: 3500, rate_24h: 5500, hourly_rate: 350, weekend_rate_24h: 6000, deposit: 3000, late_fee_per_hour: 250, total_units: 1, description: "Premium automatic 4x4 SUV.", status: "available", active: 1 },

    // Tempo Traveller
    { id: 18, slug: "tempo-traveller-12", name: "Tempo Traveller — Sakleshpura Sightseeing", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, branch_id: 1, registration_no: "KA-46-V-1212", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 1, description: "Chauffeur driven 12 seater for day trips.", status: "available", active: 1 },
    { id: 19, slug: "tempo-traveller-2days", name: "Tempo Traveller — Sakleshpura & Chikmagalur (2 Days)", brand: "Force Motors", model: "Traveller", year: 2023, category_id: 4, branch_id: 1, registration_no: "KA-46-V-1213", cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "12 km/l", included_km: 999, extra_km_rate: 0, rate_12h: 8000, rate_24h: 12000, hourly_rate: 500, weekend_rate_24h: 12050, deposit: 2000, late_fee_per_hour: 250, total_units: 1, description: "Chauffeur driven 12 seater for 2-day hill station tours.", status: "available", active: 1 },
  ];

  const { error } = await supabase.from("vehicles").upsert(vehiclesToUpsert, { onConflict: "id" });
  if (error) {
    console.error("Error upserting vehicles to Supabase:", error);
  } else {
    console.log("✅ Successfully upserted all 19 vehicles (including ALL 7 CARS) to Supabase PostgreSQL!");
  }

  const photosToUpsert = [
    { vehicle_id: 1, url: "/vehicles/honda-dio.avif", is_primary: 1 },
    { vehicle_id: 2, url: "/vehicles/honda-activa.webp", is_primary: 1 },
    { vehicle_id: 3, url: "/vehicles/tvs-jupiter.webp", is_primary: 1 },
    { vehicle_id: 4, url: "/vehicles/yamaha-rayzr.avif", is_primary: 1 },
    { vehicle_id: 5, url: "/vehicles/tvs-ntorq.webp", is_primary: 1 },
    { vehicle_id: 6, url: "/vehicles/tvs-ronin.avif", is_primary: 1 },
    { vehicle_id: 7, url: "/vehicles/honda-cb200x.jpg", is_primary: 1 },
    { vehicle_id: 8, url: "/vehicles/tvs-radar.avif", is_primary: 1 },
    { vehicle_id: 9, url: "/vehicles/bajaj-pulsar-ns.png", is_primary: 1 },
    { vehicle_id: 10, url: "/vehicles/honda-shine.avif", is_primary: 1 },
    { vehicle_id: 11, url: "/vehicles/baleno-manual.avif", is_primary: 1 },
    { vehicle_id: 13, url: "/vehicles/maruti-dzire.avif", is_primary: 1 },
    { vehicle_id: 14, url: "/vehicles/maruti-ciaz.jpg", is_primary: 1 },
    { vehicle_id: 15, url: "/vehicles/maruti-ertiga.avif", is_primary: 1 },
    { vehicle_id: 16, url: "/vehicles/mahindra-thar.avif", is_primary: 1 },
    { vehicle_id: 18, url: "/vehicles/tempo-traveller.jpg", is_primary: 1 },
    { vehicle_id: 19, url: "/vehicles/cta-tempo-banner.jpg", is_primary: 1 },
  ];
  await supabase.from("vehicle_photos").upsert(photosToUpsert, { onConflict: "id" });
  console.log("✅ Successfully upserted vehicle photos to Supabase PostgreSQL!");
}

seedAllCarsToSupabase();
