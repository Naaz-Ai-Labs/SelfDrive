import { cacheGet, cacheSet } from "./redis";
import { calculateRentalQuoteFromStrings, type RentalQuote } from "./pricing";
import type { Vehicle } from "./data";

/**
 * A quote for a searched date range. This is just the shared quote from ./pricing with a
 * couple of presentation extras — the maths itself is NOT re-implemented here any more.
 * The old local copy had its own late-drop fee and folded the deposit into `totalAmount`
 * as the amount to charge, so the site quoted a different price from the CRM.
 */
export type SearchQuoteResult = RentalQuote & {
  ratePerDayAverage: number;
  /** One-off early-pickup surcharge. Alias of `offSchedulePickupFee`, kept for callers. */
  earlyPickupFee: number;
  totalTimingFees: number;
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
  const quote = calculateRentalQuoteFromStrings(vehicle, pickupDateStr, pickupTimeStr, returnDateStr, returnTimeStr);
  if (!quote) return null;

  return {
    ...quote,
    ratePerDayAverage: Math.round(quote.baseAmount / quote.days),
    earlyPickupFee: quote.offSchedulePickupFee,
    totalTimingFees: quote.offSchedulePickupFee,
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

  // Bumped to v4 to ensure Saturday weekend package quotes (Sat + Sun) are freshly calculated
  const cacheKey = `search_quote:v4:${vehicle.id}:${pickupDateStr}:${pickupTimeStr || "08:00"}:${returnDateStr}:${returnTimeStr || "08:00"}`;

  try {
    const cached = await cacheGet<SearchQuoteResult>(cacheKey);
    if (cached && typeof cached === "object" && typeof cached.baseAmount === "number" && typeof cached.payableNow === "number") {
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
