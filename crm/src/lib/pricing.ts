import { sbSelect, num } from "./supabase-rest";
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
async function findSeasonalRule(vehicle: Vehicle, pickup: Date, ret: Date): Promise<PricingRuleRow | null> {
  const pickupDate = pickup.toISOString().slice(0, 10);
  const returnDate = ret.toISOString().slice(0, 10);

  // `NOT (end_date < pickup OR start_date > return)` is the overlap test, rewritten
  // as two inclusive bounds because PostgREST has no NOT-of-a-group.
  const scopes = [`vehicle_id.eq.${vehicle.id}`, "and(vehicle_id.is.null,category_id.is.null)"];
  if (vehicle.category_id !== null && vehicle.category_id !== undefined) {
    scopes.splice(1, 0, `category_id.eq.${vehicle.category_id}`);
  }

  const query = [
    "select=*",
    "active=eq.1",
    "day_type=neq.weekend",
    `or=${encodeURIComponent(`(${scopes.join(",")})`)}`,
    `end_date=gte.${pickupDate}`,
    `start_date=lte.${returnDate}`,
    "order=priority.desc",
  ].join("&");

  const res = await sbSelect<Record<string, unknown>>("pricing_rules", query);
  if (!res.ok) throw new Error(`Could not load pricing rules: ${res.error}`);
  if (res.data.length === 0) return null;

  // The SQL tiebreak `(vehicle_id IS NOT NULL) DESC` has no PostgREST equivalent;
  // the candidate set is tiny, so resolve it here instead.
  const rows = [...res.data].sort((a, b) => {
    const byPriority = num(b.priority) - num(a.priority);
    if (byPriority !== 0) return byPriority;
    return (b.vehicle_id ? 1 : 0) - (a.vehicle_id ? 1 : 0);
  });

  const row = rows[0];
  return {
    id: Number(row.id),
    name: String(row.name),
    vehicle_id: row.vehicle_id === null || row.vehicle_id === undefined ? null : Number(row.vehicle_id),
    category_id: row.category_id === null || row.category_id === undefined ? null : Number(row.category_id),
    day_type: String(row.day_type),
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    rate_24h: row.rate_24h === null || row.rate_24h === undefined ? null : num(row.rate_24h),
    rate_12h: row.rate_12h === null || row.rate_12h === undefined ? null : num(row.rate_12h),
    deposit: row.deposit === null || row.deposit === undefined ? null : num(row.deposit),
    included_km: row.included_km === null || row.included_km === undefined ? null : num(row.included_km),
    extra_km_rate: row.extra_km_rate === null || row.extra_km_rate === undefined ? null : num(row.extra_km_rate),
    min_days: num(row.min_days, 1),
    priority: num(row.priority),
    active: num(row.active, 1),
  };
}

/**
 * Calculates the price for a self-drive rental. The booking is always a whole number of
 * standard 8AM→8AM rental days (per the business's fixed rental-timing policy). Each day
 * is priced individually as weekday or weekend, then summed — this correctly handles a
 * booking that spans both. A seasonal/festival rule, if active for the period, overrides
 * the whole booking at its own flat day rate instead.
 */
export async function calculateQuote(vehicle: Vehicle, pickupAt: Date, returnAt: Date, pickupTimeHM?: string, returnTimeHM?: string): Promise<Quote> {
  const [rentalRules, gstPct] = await Promise.all([
    getSetting<Record<string, unknown>>("rental_rules", {}),
    getSetting<number>("tax_pct", 6),
  ]);
  const gatewayFeePassThrough = Boolean(rentalRules.gateway_fee_pass_through ?? false);
  const gatewayFeePct = gatewayFeePassThrough ? Number(rentalRules.gateway_fee_pct ?? 2) : 0;
  const weekendMinDays = Number(rentalRules.weekend_min_days ?? 2);
  const earlyPickupFee = Number(rentalRules.early_pickup_fee ?? 250);
  const lateDropFee = Number(rentalRules.late_drop_fee ?? 250);

  const msPerDay = 24 * 60 * 60 * 1000;
  const isSameDay = pickupAt.getFullYear() === returnAt.getFullYear() &&
                    pickupAt.getMonth() === returnAt.getMonth() &&
                    pickupAt.getDate() === returnAt.getDate();
  const pDayOfWeek = pickupAt.getDay();
  const rDayOfWeek = returnAt.getDay();

  const pickupTimeStr = pickupTimeHM || (pickupAt.toISOString().slice(11, 16));
  const returnTimeStr = returnTimeHM || (returnAt.toISOString().slice(11, 16));

  let days = 1;
  if (isSameDay) {
    days = pDayOfWeek === 6 ? 2 : 1;
  } else if (pDayOfWeek === 5 && (rDayOfWeek === 6 || rDayOfWeek === 0)) {
    days = 3; // Fri+Sat or Fri+Sat+Sun = 3 days
  } else if (pDayOfWeek === 6 && rDayOfWeek === 0) {
    days = 2; // Sat+Sun = 2 days
  } else {
    const baseDays = Math.max(1, Math.round((returnAt.getTime() - pickupAt.getTime()) / msPerDay));
    const isSundayReturn = returnAt.getDay() === 0;
    const isLateDrop = returnTimeStr > "08:00";
    days = baseDays + (isSundayReturn ? 1 : 0) + (isLateDrop ? 1 : 0);
  }

  const seasonalRule = await findSeasonalRule(vehicle, pickupAt, returnAt);
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

  const isEarlyPickup = pickupTimeStr < "08:00";
  const timingFeeAmount = isEarlyPickup ? 250 : 0;

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
export async function calculateCancellationRefund(pickupAt: Date, requestedAt: Date, paidAmount: number): Promise<{ pct: number; amount: number; slab: string }> {
  const rentalRules = await getSetting<Record<string, unknown>>("rental_rules", {});
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
