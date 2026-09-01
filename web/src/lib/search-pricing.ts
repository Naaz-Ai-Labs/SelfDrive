import { cacheGet, cacheSet } from "./redis";
import { calculateRentalQuoteFromStrings, type RentalQuote, type PricingRule } from "./pricing";
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
  returnTimeStr?: string | null,
  pricingRules?: PricingRule[]
): SearchQuoteResult | null {
  const quote = calculateRentalQuoteFromStrings(vehicle, pickupDateStr, pickupTimeStr, returnDateStr, returnTimeStr, pricingRules);
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
/**
 * Quote cache TTL, in seconds. Zero disables the cache entirely.
 *
 * Disabled deliberately. Nothing in the codebase ever invalidates the `search_quote:`
 * prefix — not invalidateContentCaches(), not /api/revalidate — so a staff price change
 * stayed invisible on the vehicles listing and in the booking quote for a full 10
 * minutes while the vehicle row itself updated instantly. (The `v4` in the key below is
 * a hand-rolled cache bust, evidence this had already been worked around once.)
 *
 * It is also currently pointless: UPSTASH_REDIS_REST_URL/_TOKEN are not set on either
 * Vercel project, so redis.ts degrades to a per-process in-memory Map. Each lambda then
 * holds its own copy that no other process — least of all the separately deployed CRM —
 * can invalidate.
 *
 * Set this back to 600 once Upstash is provisioned on BOTH projects; the invalidation
 * hooks for `search_quote:` are already wired up on the CRM and /api/revalidate sides.
 */
const SEARCH_QUOTE_CACHE_TTL_SECONDS = 0;

export async function getCachedVehicleSearchPrice(
  vehicle: Vehicle,
  pickupDateStr?: string | null,
  pickupTimeStr?: string | null,
  returnDateStr?: string | null,
  returnTimeStr?: string | null,
  pricingRules?: PricingRule[]
): Promise<SearchQuoteResult | null> {
  if (!pickupDateStr || !returnDateStr) return null;

  // Bumped to v4 to ensure Saturday weekend package quotes (Sat + Sun) are freshly calculated
  const cacheKey = `search_quote:v4:${vehicle.id}:${pickupDateStr}:${pickupTimeStr || "08:00"}:${returnDateStr}:${returnTimeStr || "08:00"}`;

  if (SEARCH_QUOTE_CACHE_TTL_SECONDS > 0) {
    try {
      const cached = await cacheGet<SearchQuoteResult>(cacheKey);
      if (cached && typeof cached === "object" && typeof cached.baseAmount === "number" && typeof cached.payableNow === "number") {
        return cached;
      }
    } catch (err) {
      console.warn("Redis search quote cache lookup error:", err);
    }
  }

  const computed = calculateVehicleSearchPrice(vehicle, pickupDateStr, pickupTimeStr, returnDateStr, returnTimeStr, pricingRules);
  if (computed && SEARCH_QUOTE_CACHE_TTL_SECONDS > 0) {
    try {
      await cacheSet(cacheKey, computed, SEARCH_QUOTE_CACHE_TTL_SECONDS);
    } catch (err) {
      console.warn("Redis search quote cache set error:", err);
    }
  }

  return computed;
}
