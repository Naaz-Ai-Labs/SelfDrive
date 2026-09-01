/**
 * Rental pricing for the public website.
 *
 * This mirrors `crm/src/lib/pricing.ts` — the CRM is what actually invoices the customer,
 * so anything quoted here must match it exactly. Day counting is delegated to
 * ./rental-clock (the byte-equivalent copy of the CRM module), and the owner's rules are:
 *
 *   - a rental day runs 08:00 → 08:00 IST;
 *   - pickup before 08:00 costs a ONE-OFF ₹250 surcharge, never per day;
 *   - a drop after 08:00 buys ONE MORE FULL DAY at that day's own rate — it is not a fee;
 *   - weekend = Sat/Sun, priced from the vehicle's own `weekend_rate_24h` (no "+50" rule);
 *   - weekend bookings have a 2-day minimum;
 *   - the security deposit is NOT charged online. It is cash at pickup, so it belongs to
 *     `totalAmount` (disclosure) but never to `payableNow` (what Razorpay charges).
 *
 * The site has no access to the CRM `settings` table, so the CRM's configurable defaults
 * are hard-coded here as constants. If an operator changes them in the CRM, change them
 * here too.
 */

import { computeRentalDays, isWeekendIst, istDate, istDateKey } from "./rental-clock";

/** CRM default `tax_pct`. */
export const GST_PCT = 6;
/** CRM default `rental_rules.early_pickup_fee`. One-off, never multiplied by days. */
export const EARLY_PICKUP_FEE = 250;
/** CRM default `rental_rules.weekend_min_days` — owner-confirmed real policy. */
export const WEEKEND_MIN_DAYS = 2;
/** CRM default: `gateway_fee_pass_through` is off, so the customer pays no gateway fee. */
export const GATEWAY_FEE_PCT = 0;
/** Poster rule, used when the vehicle row carries no deposit. */
export const DEPOSIT_TWO_WHEELER = 1000;
export const DEPOSIT_FOUR_WHEELER = 2000;

/** PostgREST returns numerics as strings; every money field has to go through this. */
export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Saturday and Sunday. Evaluated in IST, not the browser's or server's local zone. */
export function isWeekend(date: Date = new Date()): boolean {
  return isWeekendIst(date);
}

/**
 * The applicable 24h rate for a given day.
 *
 * Weekends use the vehicle's own `weekend_rate_24h` when it is set. When it is not, the
 * WEEKDAY rate stands — several vehicles on the price list genuinely charge the same on
 * weekends (Ronin 1800/1800, CB200X 1800/1800, Shine 1000/1000), so the old blanket
 * `baseRate + 50` invented a surcharge the owner never quoted. There is deliberately no
 * `Math.max` floor either: a weekend rate lower than the weekday rate is the owner's to
 * set, not ours to override.
 */
export function getDynamicRate24h(baseRate: number, date: Date = new Date(), weekendRate?: number | string | null): number {
  if (!baseRate || isNaN(baseRate)) return 0;
  if (!isWeekend(date)) return baseRate;
  const weekend = weekendRate === null || weekendRate === undefined ? NaN : num(weekendRate, NaN);
  return Number.isFinite(weekend) && weekend > 0 ? weekend : baseRate;
}

/** The vehicle fields a quote needs. Money may arrive from PostgREST as strings. */
export type QuoteVehicle = {
  rate_24h: number | string;
  weekend_rate_24h?: number | string | null;
  deposit?: number | string | null;
  included_km?: number | string | null;
  extra_km_rate?: number | string | null;
  category_kind?: string | null;
  /** Needed to match a pricing rule scoped to this vehicle or its category. */
  id?: number | null;
  category_id?: number | null;
};

/** Mirrors crm/src/lib/pricing.ts's PricingRuleRow — a seasonal/festival override the
 * CRM's gateway content payload exposes so the site's own quote matches what the CRM
 * will actually charge. */
export type PricingRule = {
  id: number;
  name: string;
  vehicle_id: number | null;
  category_id: number | null;
  day_type: string;
  start_date: string;
  end_date: string;
  rate_24h: number | null;
  deposit: number | null;
  included_km: number | null;
  extra_km_rate: number | null;
  min_days: number;
  priority: number;
  active: number;
};

/** Same matching rule as the CRM's findSeasonalRule: active, date-range overlap, scoped
 * to this vehicle or its category (or neither, i.e. fleet-wide), highest priority wins,
 * a vehicle-specific rule beats a category/fleet-wide one on a priority tie. The gateway
 * payload already excludes day_type=weekend and inactive rows. */
export function findApplicablePricingRule(
  rules: PricingRule[] | undefined,
  vehicle: Pick<QuoteVehicle, "id" | "category_id">,
  pickupAt: Date,
  returnAt: Date
): PricingRule | null {
  if (!rules || rules.length === 0) return null;
  const pickupKey = istDateKey(pickupAt);
  const returnKey = istDateKey(returnAt);

  const candidates = rules.filter((r) => {
    if (r.end_date < pickupKey || r.start_date > returnKey) return false;
    if (r.vehicle_id !== null) return r.vehicle_id === vehicle.id;
    if (r.category_id !== null) return vehicle.category_id != null && r.category_id === vehicle.category_id;
    return true; // fleet-wide
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const byPriority = b.priority - a.priority;
    if (byPriority !== 0) return byPriority;
    return (b.vehicle_id ? 1 : 0) - (a.vehicle_id ? 1 : 0);
  });
  return candidates[0];
}

export type RentalQuote = {
  days: number;
  weekendDaysCount: number;
  dayBreakdown: Array<{ date: string; isWeekend: boolean; rate: number }>;
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
  /** Pickup before 08:00 — the one-off early-pickup surcharge applies. */
  earlyPickup: boolean;
  /** Drop after 08:00 — one extra full day is already included in `days`. */
  lateDrop: boolean;
  /** Total rental fare (base rental + surcharges/timing fee + GST + gateway fee). Matches payableNow. */
  totalAmount: number;
  /** What Razorpay charges: rental + surcharge + GST + gateway fee. Deposit EXCLUDED. */
  payableNow: number;
  /** Cash deposit collected at pickup. Not charged online. */
  depositPayableAtPickup: number;
};

/** True for bikes and scooters, which take the ₹1000 deposit and the ₹4/km extra rate. */
export function isTwoWheeler(vehicle: Pick<QuoteVehicle, "category_kind">): boolean {
  return vehicle.category_kind === "bike" || vehicle.category_kind === "scooter";
}

/** The deposit collected in CASH at pickup — never part of the online payment. */
export function depositForVehicle(vehicle: Pick<QuoteVehicle, "deposit" | "category_kind">): number {
  const configured = num(vehicle.deposit);
  if (configured > 0) return configured;
  return isTwoWheeler(vehicle) ? DEPOSIT_TWO_WHEELER : DEPOSIT_FOUR_WHEELER;
}

import { parseIstInstant, toCanonicalIstIso } from "./rental-clock";
export { parseIstInstant, toCanonicalIstIso };

/**
 * Parses a date string (`YYYY-MM-DD` or `DD-MM-YYYY`) plus an `HH:MM` time into the
 * matching instant in IST. Returns null when the date is unusable.
 */
export function istInstantFrom(dateStr: string | null | undefined, timeHM?: string | null): Date | null {
  return parseIstInstant(dateStr, timeHM);
}

/**
 * The one quote calculation used by every surface of the website — search results,
 * vehicle pages, the booking form and the server-side booking fallback. It is the
 * website's mirror of the CRM's `calculateQuote`, including seasonal pricing rules —
 * pass the gateway content payload's `pricingRules` array so a special-pricing period
 * shows the same total here that the CRM will actually charge.
 */
export function calculateRentalQuote(
  vehicle: QuoteVehicle,
  pickupAt: Date,
  returnAt: Date,
  pickupTimeHM?: string | null,
  returnTimeHM?: string | null,
  pricingRules?: PricingRule[]
): RentalQuote {
  const clock = computeRentalDays({ pickupAt, returnAt, pickupTimeHM, returnTimeHM });
  const days = clock.days;
  const weekdayRate = num(vehicle.rate_24h);
  const seasonalRule = findApplicablePricingRule(pricingRules, vehicle, pickupAt, returnAt);

  let baseAmount = 0;
  let weekendDaysCount = 0;
  const dayBreakdown: RentalQuote["dayBreakdown"] = [];

  for (const day of clock.dayDates) {
    const weekend = isWeekend(day);
    if (weekend) weekendDaysCount++;
    const rate = seasonalRule ? num(seasonalRule.rate_24h, weekdayRate) : weekend ? getDynamicRate24h(weekdayRate, day, vehicle.weekend_rate_24h) : weekdayRate;
    dayBreakdown.push({ date: istDateKey(day), isWeekend: weekend, rate });
    baseAmount += rate;
  }

  // One-off, never multiplied by the number of days. A late drop is NOT charged here —
  // rental-clock already added a whole extra day above, priced at that day's own rate.
  const timingFeeAmount = clock.earlyPickup ? EARLY_PICKUP_FEE : 0;

  const rawKm = seasonalRule?.included_km ?? num(vehicle.included_km, 100);
  const includedKm = rawKm >= 999 ? 999999 : rawKm * days;
  const twoWheeler = isTwoWheeler(vehicle);
  const extraKmRate = seasonalRule?.extra_km_rate ?? num(vehicle.extra_km_rate, twoWheeler ? 4 : 8);
  const configuredDeposit = num(seasonalRule?.deposit ?? vehicle.deposit);
  const deposit = configuredDeposit > 0 ? configuredDeposit : depositForVehicle(vehicle);
  const effectiveWeekendMin = seasonalRule?.min_days && seasonalRule.min_days > 1 ? seasonalRule.min_days : WEEKEND_MIN_DAYS;

  const taxableAmount = baseAmount + timingFeeAmount;
  const gstAmount = Math.round(taxableAmount * (GST_PCT / 100));
  const gatewayFeeAmount = Math.round((taxableAmount + gstAmount) * (GATEWAY_FEE_PCT / 100));

  // Total rental amount equals payableNow.
  // The refundable security deposit is kept separate in `depositAmount` / `depositPayableAtPickup`.
  const payableNow = taxableAmount + gstAmount + gatewayFeeAmount;
  const totalAmount = payableNow;

  return {
    days,
    weekendDaysCount,
    dayBreakdown,
    baseAmount,
    offSchedulePickupFee: timingFeeAmount,
    gstAmount,
    gstPct: GST_PCT,
    gatewayFeeAmount,
    gatewayFeePct: GATEWAY_FEE_PCT,
    depositAmount: deposit,
    includedKm,
    extraKmRate,
    afterHours: clock.earlyPickup,
    offSchedulePickup: timingFeeAmount > 0,
    weekendMinDays: effectiveWeekendMin,
    belowWeekendMinimum: isWeekend(pickupAt) && days < effectiveWeekendMin,
    appliedRuleName: seasonalRule?.name ?? null,
    earlyPickup: clock.earlyPickup,
    lateDrop: clock.lateDrop,
    totalAmount,
    payableNow,
    depositPayableAtPickup: deposit,
  };
}

/** Convenience wrapper for callers that hold separate date and time strings. */
export function calculateRentalQuoteFromStrings(
  vehicle: QuoteVehicle,
  pickupDateStr: string | null | undefined,
  pickupTimeStr: string | null | undefined,
  returnDateStr: string | null | undefined,
  returnTimeStr: string | null | undefined,
  pricingRules?: PricingRule[]
): RentalQuote | null {
  const pickupTime = pickupTimeStr || "08:00";
  const returnTime = returnTimeStr || "08:00";
  const pickupAt = istInstantFrom(pickupDateStr, pickupTime);
  const returnAt = istInstantFrom(returnDateStr, returnTime);
  if (!pickupAt || !returnAt) return null;
  return calculateRentalQuote(vehicle, pickupAt, returnAt, pickupTime, returnTime, pricingRules);
}

/**
 * Strict Late Return Policy:
 * Overdue by even 1 minute = Billed full additional day charge!
 */
export function calculateLateFee(
  scheduledReturn: Date,
  actualReturn: Date,
  rate24h: number = 900,
  weekendRate?: number | string | null
): { minutesLate: number; fee: number; breakdown: string } {
  const msLate = actualReturn.getTime() - scheduledReturn.getTime();
  const minutesLate = Math.max(0, Math.ceil(msLate / 60000));

  if (minutesLate <= 0) {
    return { minutesLate: 0, fee: 0, breakdown: "Returned on time — no late fee." };
  }

  const extraDays = Math.ceil(minutesLate / (24 * 60));
  const effectiveDailyRate = getDynamicRate24h(rate24h, actualReturn, weekendRate);
  const fee = extraDays * effectiveDailyRate;

  return {
    minutesLate,
    fee,
    breakdown: `Overdue by ${minutesLate} min — billed full extra day charge (₹${effectiveDailyRate}/day x ${extraDays} day${extraDays > 1 ? "s" : ""}).`,
  };
}

/**
 * Authoritative financial calculator for bookings.
 * Enforces the invariant that refundable security deposit is strictly isolated
 * from total rental fare and balance due.
 */
export function calculateBookingFinancials(booking: {
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  deposit_amount?: number | string | null;
  base_amount?: number | string | null;
  gst_amount?: number | string | null;
  surcharge_amount?: number | string | null;
  other_fees_amount?: number | string | null;
  extra_hours_amount?: number | string | null;
  extra_km_amount?: number | string | null;
  late_fee_amount?: number | string | null;
  damage_amount?: number | string | null;
  discount_amount?: number | string | null;
}) {
  let totalAmount = num(booking.total_amount);
  const paidAmount = num(booking.paid_amount);
  const depositAmount = num(booking.deposit_amount);
  const baseAmount = num(booking.base_amount);
  const gstAmount = num(booking.gst_amount);
  const extraCharges =
    num(booking.surcharge_amount) +
    num(booking.other_fees_amount) +
    num(booking.extra_hours_amount) +
    num(booking.extra_km_amount) +
    num(booking.late_fee_amount) +
    num(booking.damage_amount) -
    num(booking.discount_amount);

  const expectedRentalTotal = baseAmount + gstAmount + extraCharges;
  // If baseAmount is present and totalAmount was inflated by depositAmount:
  // e.g. base=2800, gst=168, deposit=1000, total_amount=3968 => clean rental total is 2968
  if (baseAmount > 0 && depositAmount > 0 && (totalAmount >= expectedRentalTotal + depositAmount || totalAmount === baseAmount + gstAmount + depositAmount)) {
    totalAmount = expectedRentalTotal;
  } else if (totalAmount === 0 && expectedRentalTotal > 0) {
    totalAmount = expectedRentalTotal;
  }

  const balanceDue = Math.max(0, totalAmount - paidAmount);
  const isFullyPaid = paidAmount >= totalAmount && totalAmount > 0;

  return {
    totalAmount,
    paidAmount,
    depositAmount,
    balanceDue,
    isFullyPaid,
  };
}
