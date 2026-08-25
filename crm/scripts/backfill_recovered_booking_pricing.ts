/**
 * One-off backfill for bookings created by payment-actions.ts's auto-link recovery
 * path BEFORE the pricing fix landed — they carry base_amount=0, gst_amount=0, while
 * total_amount/deposit_amount/paid_amount are already correct (those were always
 * populated; only the itemised breakdown was missing).
 *
 * Recomputes the SAME authoritative quote calculateQuote() produces (never invents a
 * number) and only writes it back if the freshly-computed total/deposit match the
 * booking's EXISTING total_amount/deposit_amount exactly — if they don't match, the
 * row is left untouched and reported, not guessed at.
 *
 * Read-only until the final UPDATE per row; run once, not meant to be scheduled.
 */
import fs from "fs";
import path from "path";
for (const name of [".env.local", ".env"]) {
  const envPath = path.resolve(__dirname, "..", name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (k && v && !process.env[k]) process.env[k] = v;
  }
}

import { sbSelect, sbUpdate, num } from "../src/lib/supabase-rest";
import { getVehicleById } from "../src/lib/data";
import { calculateQuote } from "../src/lib/pricing";
import { parseIstInstant } from "../src/lib/rental-clock";

async function main() {
  const res = await sbSelect<Record<string, unknown>>(
    "bookings",
    "select=id,booking_no,vehicle_id,pickup_at,return_at,status,base_amount,gst_amount,deposit_amount,total_amount,paid_amount,other_fees_amount,included_km&base_amount=eq.0&total_amount=gt.0&status=neq.Rejected&status=neq.Cancelled"
  );
  if (!res.ok) throw new Error(`could not list affected bookings: ${res.error}`);

  console.log(`Found ${res.data.length} candidate booking(s).\n`);

  for (const b of res.data) {
    const id = Number(b.id);
    const bookingNo = String(b.booking_no);
    const vehicleId = Number(b.vehicle_id);
    const existingTotal = num(b.total_amount);
    const existingDeposit = num(b.deposit_amount);

    console.log(`--- ${bookingNo} (id ${id}, vehicle ${vehicleId}) ---`);

    const vehicle = await getVehicleById(vehicleId, false);
    const pickup = parseIstInstant(String(b.pickup_at));
    const ret = parseIstInstant(String(b.return_at));

    if (!vehicle || !pickup || !ret) {
      console.log(`  SKIP — could not resolve vehicle/dates (vehicle=${!!vehicle}, pickup=${!!pickup}, return=${!!ret})`);
      continue;
    }

    const quote = await calculateQuote(vehicle, pickup, ret);

    console.log(`  existing: total=${existingTotal} deposit=${existingDeposit}`);
    console.log(`  computed: base=${quote.baseAmount} gst=${quote.gstAmount} total=${quote.totalAmount} deposit=${quote.depositAmount} otherFees=${num(quote.offSchedulePickupFee) + num(quote.gatewayFeeAmount)} includedKm=${quote.includedKm}`);

    if (quote.totalAmount !== existingTotal) {
      console.log(`  SKIP — computed total (${quote.totalAmount}) does not match existing total (${existingTotal}); needs manual review, not touching.`);
      continue;
    }
    if (quote.depositAmount !== existingDeposit) {
      console.log(`  SKIP — computed deposit (${quote.depositAmount}) does not match existing deposit (${existingDeposit}); needs manual review, not touching.`);
      continue;
    }

    const otherFees = num(quote.offSchedulePickupFee) + num(quote.gatewayFeeAmount);
    const upd = await sbUpdate("bookings", `id=eq.${id}`, {
      base_amount: num(quote.baseAmount),
      gst_amount: num(quote.gstAmount),
      other_fees_amount: otherFees,
      included_km: num(quote.includedKm),
    });

    if (!upd.ok) {
      console.log(`  FAILED to update: ${upd.error}`);
      continue;
    }
    console.log(`  FIXED — base_amount and gst_amount backfilled.`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("THREW:", e); process.exit(1); });
