/**
 * Rental-day arithmetic — the single source of truth.
 *
 * The business sells whole rental days that run 08:00 → 08:00 (India time):
 *   pickup 12 Aug 08:00 → drop 13 Aug 08:00 is exactly ONE day.
 *
 * Two boundary rules come off the owner's price posters:
 *   - pickup EARLIER than 08:00  → a one-off surcharge (priced by the caller, not here).
 *   - drop LATER than 08:00      → ONE ADDITIONAL FULL DAY, charged at that extra day's
 *                                  own weekday/weekend rate. It is not a flat fee.
 *
 * Everything here is pure: no DB, no clock reads, no side effects.
 *
 * TIMEZONE: all maths is done in Asia/Kolkata, matching the `timeZone: "Asia/Kolkata"`
 * pinned in web/src/lib/utils.ts. The server's local zone is deliberately never used —
 * Vercel runs in UTC, and reading local date parts there shifts the 08:00 boundary by
 * 5.5 hours, silently mis-counting every early-morning booking. IST has no DST and has
 * held a fixed +05:30 offset for the lifetime of this business, so a constant offset is
 * exact (and avoids an Intl round-trip on every day of every quote).
 */

/** Rental days start and end at 08:00 IST. */
export const RENTAL_DAY_START_HOUR = 8;

/** Asia/Kolkata is a fixed UTC+05:30 with no DST. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type IstParts = {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday, in IST. */
  weekday: number;
};

/** Reads an instant's wall-clock parts as they appear in Asia/Kolkata. */
export function istParts(date: Date): IstParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Builds the instant for a given IST wall-clock time. Month/year rollover is handled by Date.UTC. */
export function istDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS);
}

/** Saturday and Sunday are weekend; Monday–Friday are weekday. Evaluated in IST. */
export function isWeekendIst(date: Date): boolean {
  const wd = istParts(date).weekday;
  return wd === 0 || wd === 6;
}

/** The IST calendar date (08:00 IST anchor) that an instant falls on. */
export function rentalDayStart(date: Date): Date {
  const p = istParts(date);
  return istDate(p.year, p.month, p.day, RENTAL_DAY_START_HOUR);
}

/** `YYYY-MM-DD` for an instant, in IST — never the UTC slice, which is a day off before 05:30. */
export function istDateKey(date: Date): string {
  const p = istParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Whole IST calendar days between two instants (b − a), ignoring time of day. */
export function calendarDaysBetween(a: Date, b: Date): number {
  const pa = istParts(a);
  const pb = istParts(b);
  const ua = Date.UTC(pa.year, pa.month, pa.day);
  const ub = Date.UTC(pb.year, pb.month, pb.day);
  return Math.round((ub - ua) / MS_PER_DAY);
}

/** Minutes past IST midnight. */
function minutesOfDay(date: Date): number {
  const p = istParts(date);
  return p.hour * 60 + p.minute;
}

/** Parses an "HH:MM" override into minutes past midnight, or null if unusable. */
function parseHM(hm?: string | null): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

export type RentalClockInput = {
  pickupAt: Date;
  returnAt: Date;
  /** Optional "HH:MM" IST overrides, for forms that carry the time separately from the date. */
  pickupTimeHM?: string | null;
  returnTimeHM?: string | null;
};

export type RentalClockResult = {
  /** Whole rental days to charge. Always >= 1. */
  days: number;
  /** Pickup before 08:00 IST — a one-off surcharge, never per day. */
  earlyPickup: boolean;
  /** Drop after 08:00 IST — already reflected as one extra entry in `days`/`dayDates`. */
  lateDrop: boolean;
  /**
   * One Date per charged day, at 08:00 IST, so the caller can price each day as
   * weekday or weekend individually (a booking can span both).
   */
  dayDates: Date[];
};

const RENTAL_DAY_START_MINUTES = RENTAL_DAY_START_HOUR * 60;

/**
 * Counts the charged rental days for a booking.
 *
 * The charged span starts at 08:00 IST on the pickup's IST calendar date (picking up
 * early does not buy an extra day — it costs the early-pickup surcharge instead) and
 * runs to 08:00 IST on the drop date, plus one whole day if the drop is after 08:00.
 * Same-day bookings therefore cost one day, never zero.
 */
export function computeRentalDays(input: RentalClockInput): RentalClockResult {
  const { pickupAt, returnAt } = input;
  if (!(pickupAt instanceof Date) || Number.isNaN(pickupAt.getTime())) {
    throw new Error("computeRentalDays: pickupAt is not a valid Date");
  }
  if (!(returnAt instanceof Date) || Number.isNaN(returnAt.getTime())) {
    throw new Error("computeRentalDays: returnAt is not a valid Date");
  }

  const pickupMinutes = parseHM(input.pickupTimeHM) ?? minutesOfDay(pickupAt);
  const returnMinutes = parseHM(input.returnTimeHM) ?? minutesOfDay(returnAt);

  const earlyPickup = pickupMinutes < RENTAL_DAY_START_MINUTES;
  const lateDrop = returnMinutes > RENTAL_DAY_START_MINUTES;

  const isSaturday = istParts(pickupAt).weekday === 6;
  const spanDays = calendarDaysBetween(pickupAt, returnAt);
  const rawDays = Math.max(1, spanDays + (lateDrop ? 1 : 0));
  // A rental starting on Saturday locks the vehicle for the full weekend package (Saturday + Sunday = 2 days minimum)
  const days = isSaturday ? Math.max(2, rawDays) : rawDays;

  const p = istParts(pickupAt);
  const dayDates: Date[] = [];
  for (let i = 0; i < days; i++) {
    // Date.UTC normalises day overflow, so month and year boundaries need no special case.
    dayDates.push(istDate(p.year, p.month, p.day + i, RENTAL_DAY_START_HOUR));
  }

  return { days, earlyPickup, lateDrop, dayDates };
}
