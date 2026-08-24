import fs from "fs";
import path from "path";

// Load .env.local if present
try {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    } else {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...v] = trimmed.split("=");
        if (k && v.length > 0 && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join("=").trim();
        }
      }
    }
  }
} catch {}

import { sbSelect, sbUpdate, num } from "../src/lib/supabase-rest";
import { calculateRentalQuote, QuoteVehicle } from "../../web/src/lib/pricing";
import { parseIstInstant } from "../src/lib/rental-clock";

async function main() {
  console.log("Fetching all bookings from Supabase...");
  const res = await sbSelect<Record<string, any>>(
    "bookings",
    "select=*,vehicles(id,name,category_id,rate_24h,weekend_rate_24h,deposit,included_km,extra_km_rate)&order=id.asc"
  );

  if (!res.ok) {
    console.error("Failed to fetch bookings:", res.error);
    process.exit(1);
  }

  const bookings = res.data;
  console.log(`Found ${bookings.length} bookings in database.`);

  for (const b of bookings) {
    console.log(`\n-------------------------------------------`);
    console.log(`Booking ID: ${b.id} | No: ${b.booking_no} | Status: ${b.status}`);
    console.log(`Customer: ${b.customer_name} (${b.customer_phone})`);
    console.log(`Vehicle: ${b.vehicles?.name} (ID: ${b.vehicle_id})`);
    console.log(`Pickup: ${b.pickup_at} | Return: ${b.return_at}`);
    console.log(`Current DB Values: base=${b.base_amount}, surcharge=${b.surcharge_amount}, gst=${b.gst_amount}, total=${b.total_amount}, paid=${b.paid_amount}, deposit=${b.deposit_amount}`);

    const pickup = parseIstInstant(b.pickup_at);
    const ret = parseIstInstant(b.return_at);

    if (!pickup || !ret) {
      console.log("Could not parse dates, skipping re-quote.");
      continue;
    }

    const vRow = b.vehicles || {};
    const catId = Number(vRow.category_id || 3);
    const isCar = catId === 1 || catId === 4;
    const defaultRate = catId === 1 ? 3500 : catId === 4 ? 12000 : catId === 2 ? 1200 : 900;
    const defaultDeposit = isCar ? 2000 : 1000;

    const rate24h = num(vRow.rate_24h || defaultRate);
    const weekendRate = num(vRow.weekend_rate_24h || (rate24h > 0 ? rate24h + 50 : defaultRate));
    const vehicle: QuoteVehicle = {
      rate_24h: rate24h,
      weekend_rate_24h: weekendRate,
      deposit: num(vRow.deposit || defaultDeposit),
      included_km: num(vRow.included_km || (isCar ? 300 : 100)),
      extra_km_rate: num(vRow.extra_km_rate || (isCar ? 8 : 4)),
      category_kind: catId === 1 ? "car" : catId === 4 ? "van" : catId === 2 ? "bike" : "scooter",
    };

    const quote = calculateRentalQuote(vehicle, pickup, ret);
    console.log(`Calculated True Quote: days=${quote.days}, base=${quote.baseAmount}, surcharge=${quote.offSchedulePickupFee}, gst=${quote.gstAmount}, total=${quote.totalAmount}, deposit=${quote.depositAmount}`);

    const newBase = quote.baseAmount;
    const newSurcharge = quote.offSchedulePickupFee;
    const newGst = quote.gstAmount;
    const newTotal = quote.totalAmount;
    const newDeposit = quote.depositAmount;

    if (
      num(b.base_amount) !== newBase ||
      num(b.total_amount) !== newTotal ||
      num(b.gst_amount) !== newGst
    ) {
      console.log(`>> UPDATING booking ${b.id} with corrected values: base=${newBase}, surcharge=${newSurcharge}, gst=${newGst}, total=${newTotal}, deposit=${newDeposit}`);
      const upd = await sbUpdate("bookings", `id=eq.${b.id}`, {
        base_amount: newBase,
        surcharge_amount: newSurcharge,
        gst_amount: newGst,
        total_amount: newTotal,
        deposit_amount: newDeposit,
      });

      if (!upd.ok) {
        console.error(`Failed to update booking ${b.id}:`, upd.error);
      } else {
        console.log(`✓ Booking ${b.id} successfully updated!`);
      }
    } else {
      console.log(`Booking ${b.id} already has correct pricing.`);
    }
  }

  console.log("\n===========================================");
  console.log("All bookings processed and reconciled!");
}

main().catch(console.error);
