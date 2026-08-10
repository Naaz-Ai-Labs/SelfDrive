import { cacheGet, cacheSet } from "./redis";
import type { Vehicle } from "./data";

export type SearchQuoteResult = {
  days: number;
  baseAmount: number;
  ratePerDayAverage: number;
  weekendDaysCount: number;
  earlyPickupFee: number;
  lateDropFee: number;
  totalTimingFees: number;
  depositAmount: number;
  gstAmount: number;
  totalAmount: number;
  dayBreakdown: Array<{ date: string; isWeekend: boolean; rate: number }>;
  isSearchQueryActive: boolean;
};

export function parseDateParts(dateStr: string): { year: number; month: number; day: number; dateObj: Date } | null {
  if (!dateStr) return null;
  const clean = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  const parts = clean.split(/[-/.]/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  let y: number, m: number, d: number;
  if (parts[0] > 1000) {
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else if (parts[2] > 1000) {
    y = parts[2];
    m = parts[1];
    d = parts[0];
  } else {
    y = parts[0];
    m = parts[1];
    d = parts[2];
  }
  const dateObj = new Date(y, m - 1, d);
  return { year: y, month: m, day: d, dateObj };
}

export function calculateVehicleSearchPrice(
  vehicle: Vehicle,
  pickupDateStr?: string | null,
  pickupTimeStr?: string | null,
  returnDateStr?: string | null,
  returnTimeStr?: string | null
): SearchQuoteResult | null {
  if (!pickupDateStr || !returnDateStr) return null;

  const pParts = parseDateParts(pickupDateStr);
  const rParts = parseDateParts(returnDateStr);
  if (!pParts || !rParts) return null;

  const isSundayReturn = rParts.dateObj.getDay() === 0;
  const standardReturnTime = isSundayReturn ? "09:00" : "08:00";
  const pTime = pickupTimeStr || "08:00";
  const rTime = returnTimeStr || standardReturnTime;

  const pDate = new Date(`${pParts.year}-${String(pParts.month).padStart(2, "0")}-${String(pParts.day).padStart(2, "0")}T${pTime}`);
  const rDate = new Date(`${rParts.year}-${String(rParts.month).padStart(2, "0")}-${String(rParts.day).padStart(2, "0")}T${rTime}`);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = Math.max(0, rDate.getTime() - pDate.getTime());
  const days = Math.max(1, Math.round(diffMs / msPerDay));

  let baseAmount = 0;
  let weekendDaysCount = 0;
  const dayBreakdown: Array<{ date: string; isWeekend: boolean; rate: number }> = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(pDate.getTime() + i * msPerDay);
    const dayOfWeek = day.getDay();
    const isWknd = dayOfWeek === 0 || dayOfWeek === 6; // Sunday=0, Saturday=6
    if (isWknd) weekendDaysCount++;
    const rate = isWknd ? Number(vehicle.weekend_rate_24h ?? (vehicle.rate_24h + 50)) : Number(vehicle.rate_24h);
    dayBreakdown.push({ date: day.toISOString().slice(0, 10), isWeekend: isWknd, rate });
    baseAmount += rate;
  }

  const isEarlyPickup = pTime < "08:00";
  const isLateDrop = isSundayReturn ? rTime > "09:00" : rTime > pTime;
  const earlyPickupFee = isEarlyPickup ? 250 : 0;
  const lateDropFee = isLateDrop ? 250 : 0;
  const totalTimingFees = earlyPickupFee + lateDropFee;

  const depositAmount = Number(vehicle.deposit ?? 1000);
  const taxableAmount = baseAmount + totalTimingFees;
  const gstAmount = Math.round(taxableAmount * 0.06);
  const totalAmount = taxableAmount + depositAmount + gstAmount;

  return {
    days,
    baseAmount,
    ratePerDayAverage: Math.round(baseAmount / days),
    weekendDaysCount,
    earlyPickupFee,
    lateDropFee,
    totalTimingFees,
    depositAmount,
    gstAmount,
    totalAmount,
    dayBreakdown,
    isSearchQueryActive: true,
  };
}

/**
 * Cached fetch with Redis to retrieve/store search quote
 */
export async function getCachedVehicleSearchPrice(
  vehicle: Vehicle,
  pickupDateStr?: string | null,
  pickupTimeStr?: string | null,
  returnDateStr?: string | null,
  returnTimeStr?: string | null
): Promise<SearchQuoteResult | null> {
  if (!pickupDateStr || !returnDateStr) return null;

  const cacheKey = `search_quote:${vehicle.id}:${pickupDateStr}:${pickupTimeStr || "08:00"}:${returnDateStr}:${returnTimeStr || "08:00"}`;

  try {
    const cached = await cacheGet<SearchQuoteResult>(cacheKey);
    if (cached && typeof cached === "object" && typeof cached.baseAmount === "number") {
      return cached;
    }
  } catch (err) {
    console.warn("Redis search quote cache lookup error:", err);
  }

  const computed = calculateVehicleSearchPrice(vehicle, pickupDateStr, pickupTimeStr, returnDateStr, returnTimeStr);
  if (computed) {
    try {
      // Cache in Redis for 10 minutes (600s)
      await cacheSet(cacheKey, computed, 600);
    } catch (err) {
      console.warn("Redis search quote cache set error:", err);
    }
  }

  return computed;
}
