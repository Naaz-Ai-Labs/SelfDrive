import { getDb } from "./db";
import { getSetting } from "./settings";
import type { Vehicle } from "./data";

export type PricingRuleRow = {
  id: number;
  name: string;
  vehicle_id: number | null;
  category_id: number | null;
  day_type: string;
  start_date: string;
  end_date: string;
  rate_24h: number | null;
  rate_12h: number | null;
  deposit: number | null;
  included_km: number | null;
  extra_km_rate: number | null;
  min_days: number;
  priority: number;
  active: number;
};

export type Quote = {
  days: number;
  weekendDaysCount?: number;
  dayBreakdown: Array<{ date: string; dayType: "weekday" | "weekend"; rate: number }>;
  baseAmount: number;
  offSchedulePickupFee: number;
  gstAmount: number;
  gstPct: number;
  gatewayFeeAmount: number;
  gatewayFeePct: number;
  depositAmount: number;
  includedKm: number;
  extraKmRate: number;
  afterHours: boolean;
  offSchedulePickup: boolean;
  weekendMinDays: number;
  belowWeekendMinimum: boolean;
  appliedRuleName: string | null;
  totalAmount: number;
  payableNow: number;
};

export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday=0, Saturday=6
}

export function getDynamicRate24h(baseRate: number, date: Date = new Date()): number {
  if (!baseRate || isNaN(baseRate)) return 0;
  return isWeekend(date) ? baseRate + 50 : baseRate;
}

/** A seasonal/festival/long-weekend override that applies to the whole booking period, taking priority over standard weekday/weekend rates. */
function findSeasonalRule(vehicle: Vehicle, pickup: Date, ret: Date): PricingRuleRow | null {
  const db = getDb();
  const pickupDate = pickup.toISOString().slice(0, 10);
  const returnDate = ret.toISOString().slice(0, 10);
  const row = db
    .prepare(
      `SELECT * FROM pricing_rules
       WHERE active = 1 AND day_type != 'weekend'
         AND (vehicle_id = ? OR category_id = ? OR (vehicle_id IS NULL AND category_id IS NULL))
         AND NOT (end_date < ? OR start_date > ?)
       ORDER BY priority DESC, (vehicle_id IS NOT NULL) DESC
       LIMIT 1`
    )
    .get(vehicle.id, vehicle.category_id, pickupDate, returnDate) as PricingRuleRow | undefined;
  return row ?? null;
}

/**
 * Calculates the price for a self-drive rental. The booking is always a whole number of
 * standard 8AM→8AM rental days (per the business's fixed rental-timing policy). Each day
 * is priced individually as weekday or weekend, then summed — this correctly handles a
 * booking that spans both. A seasonal/festival rule, if active for the period, overrides
 * the whole booking at its own flat day rate instead.
 */
export function calculateQuote(vehicle: Vehicle, pickupAt: Date, returnAt: Date, pickupTimeHM?: string, returnTimeHM?: string): Quote {
  const rentalRules = getSetting<Record<string, unknown>>("rental_rules", {});
  const gstPct = getSetting<number>("tax_pct", 6);
  const gatewayFeePassThrough = Boolean(rentalRules.gateway_fee_pass_through ?? false);
  const gatewayFeePct = gatewayFeePassThrough ? Number(rentalRules.gateway_fee_pct ?? 2) : 0;
  const weekendMinDays = Number(rentalRules.weekend_min_days ?? 2);
  const earlyPickupFee = Number(rentalRules.early_pickup_fee ?? 250);
  const lateDropFee = Number(rentalRules.late_drop_fee ?? 250);

  const msPerDay = 24 * 60 * 60 * 1000;
  const baseDays = Math.max(1, Math.round((returnAt.getTime() - pickupAt.getTime()) / msPerDay));
  const isSundayReturn = returnAt.getDay() === 0;
  // Sunday drop-off includes one extra day rental charge (Sunday weekend rate)
  const days = isSundayReturn ? baseDays + 1 : baseDays;

  const seasonalRule = findSeasonalRule(vehicle, pickupAt, returnAt);
  const dayBreakdown: Quote["dayBreakdown"] = [];
  let baseAmount = 0;

  let weekendDaysCount = 0;

  for (let i = 0; i < days; i++) {
    const day = new Date(pickupAt.getTime() + i * msPerDay);
    const weekend = isWeekend(day);
    if (weekend) weekendDaysCount++;
    const rate = seasonalRule
      ? Number(seasonalRule.rate_24h ?? vehicle.rate_24h)
      : weekend
        ? Number(vehicle.weekend_rate_24h ?? (vehicle.rate_24h + 50))
        : Number(vehicle.rate_24h);
    dayBreakdown.push({ date: day.toISOString().slice(0, 10), dayType: weekend ? "weekend" : "weekday", rate });
    baseAmount += rate;
  }

  const bookingStartsWeekend = isWeekend(pickupAt);
  const effectiveWeekendMin = seasonalRule?.min_days && seasonalRule.min_days > 1 ? seasonalRule.min_days : weekendMinDays;
  const belowWeekendMinimum = bookingStartsWeekend && days < effectiveWeekendMin;

  // Off-schedule timing fees: ₹250 for early pickup (< 08:00), ₹250 for late dropoff (> pickup time or > 09:00 on Sundays)
  const pickupTimeStr = pickupTimeHM || (pickupAt.toISOString().slice(11, 16));
  const returnTimeStr = returnTimeHM || (returnAt.toISOString().slice(11, 16));

  const isEarlyPickup = pickupTimeStr < "08:00";
  const isLateDrop = isSundayReturn ? returnTimeStr > "09:00" : returnTimeStr > pickupTimeStr;
  const timingFeeAmount = (isEarlyPickup ? 250 : 0) + (isLateDrop ? 250 : 0);

  const rawKm = seasonalRule?.included_km ?? vehicle.included_km ?? 100;
  const includedKm = rawKm >= 999 ? 999999 : rawKm * days;
  const defaultKmRate = (vehicle.category_kind === "bike" || vehicle.category_kind === "scooter") ? 4 : 8;
  const extraKmRate = seasonalRule?.extra_km_rate ?? vehicle.extra_km_rate ?? defaultKmRate;
  const deposit = seasonalRule?.deposit ?? vehicle.deposit;

  const taxableAmount = baseAmount + timingFeeAmount;
  const gstAmount = Math.round(taxableAmount * (gstPct / 100));
  const gatewayFeeAmount = Math.round((taxableAmount + gstAmount) * (gatewayFeePct / 100));
  const totalAmount = taxableAmount + gstAmount + gatewayFeeAmount + deposit;

  return {
    days,
    weekendDaysCount,
    dayBreakdown,
    baseAmount,
    offSchedulePickupFee: timingFeeAmount,
    gstAmount,
    gstPct,
    gatewayFeeAmount,
    gatewayFeePct,
    depositAmount: deposit,
    includedKm,
    extraKmRate,
    afterHours: isEarlyPickup,
    offSchedulePickup: timingFeeAmount > 0,
    weekendMinDays: effectiveWeekendMin,
    belowWeekendMinimum,
    appliedRuleName: seasonalRule?.name ?? null,
    totalAmount,
    payableNow: totalAmount,
  };
}

export function calculateLateFee(
  scheduledReturn: Date,
  actualReturn: Date,
  rate24h: number = 900
): { minutesLate: number; fee: number; breakdown: string } {
  const msLate = actualReturn.getTime() - scheduledReturn.getTime();
  const minutesLate = Math.max(0, Math.ceil(msLate / 60000));

  if (minutesLate <= 0) {
    return { minutesLate: 0, fee: 0, breakdown: "Returned on time — no late fee." };
  }

  // Strict Return Policy: Overdue by even 1 minute = Billed full additional day charge!
  const extraDays = Math.ceil(minutesLate / (24 * 60));
  const effectiveDailyRate = getDynamicRate24h(rate24h, actualReturn);
  const fee = extraDays * effectiveDailyRate;

  return {
    minutesLate,
    fee,
    breakdown: `Overdue by ${minutesLate} min — billed full extra day charge (₹${effectiveDailyRate}/day x ${extraDays} day${extraDays > 1 ? "s" : ""}).`,
  };
}

export function calculateExtraKm(includedKm: number, startOdo: number, endOdo: number, extraKmRate: number): { travelled: number; extraKm: number; amount: number } {
  const travelled = Math.max(0, endOdo - startOdo);
  const extraKm = Math.max(0, travelled - includedKm);
  const rate = extraKmRate || 8;
  return { travelled, extraKm, amount: Math.round(extraKm * rate) };
}

/** Cancellation refund slabs, based on how far ahead of pickup the request is made. */
export function calculateCancellationRefund(pickupAt: Date, requestedAt: Date, paidAmount: number): { pct: number; amount: number; slab: string } {
  const rentalRules = getSetting<Record<string, unknown>>("rental_rules", {});
  const hoursBefore = (pickupAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60);
  const fullRefundHours = Number(rentalRules.cancel_full_refund_hours ?? 24);
  const partialRefundHours = Number(rentalRules.cancel_partial_refund_hours ?? 6);
  const partialRefundPct = Number(rentalRules.cancel_partial_refund_pct ?? 50);
  const processingFeePct = Number(rentalRules.cancel_processing_fee_pct ?? 5);

  if (hoursBefore >= fullRefundHours) {
    const amount = Math.round(paidAmount * (1 - processingFeePct / 100));
    return { pct: 100 - processingFeePct, amount, slab: `${fullRefundHours}+ hours before pickup — full refund minus processing fee.` };
  }
  if (hoursBefore >= partialRefundHours) {
    return { pct: partialRefundPct, amount: Math.round(paidAmount * (partialRefundPct / 100)), slab: `${partialRefundHours}–${fullRefundHours} hours before pickup — ${partialRefundPct}% refund.` };
  }
  return { pct: 0, amount: 0, slab: `Less than ${partialRefundHours} hours before pickup — no refund.` };
}
