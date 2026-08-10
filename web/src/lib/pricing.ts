/**
 * Live Clock Weekend Pricing & Strict Late Fee Utility for Web Application
 */

export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

/**
 * Calculates 24h rate hiked by +₹50 on Saturdays & Sundays.
 */
export function getDynamicRate24h(baseRate: number, date: Date = new Date()): number {
  if (!baseRate || isNaN(baseRate)) return 0;
  return isWeekend(date) ? baseRate + 50 : baseRate;
}

/**
 * Calculates rental price across a date range accounting for live weekend price hikes.
 */
export function calculateRentalPrice(
  rate24h: number,
  pickupAt: Date,
  returnAt: Date
): { totalAmount: number; daysCount: number; weekendDaysCount: number; rateUsed: number } {
  const ms = Math.max(0, returnAt.getTime() - pickupAt.getTime());
  const hours = Math.ceil(ms / (1000 * 3600));
  const baseDays = Math.max(1, Math.round(hours / 24));
  const isSundayReturn = returnAt.getDay() === 0;
  const daysCount = isSundayReturn ? baseDays + 1 : baseDays;

  let totalAmount = 0;
  let weekendDaysCount = 0;

  const current = new Date(pickupAt);
  for (let i = 0; i < daysCount; i++) {
    const day = current.getDay();
    if (day === 0 || day === 6) {
      totalAmount += rate24h + 50;
      weekendDaysCount++;
    } else {
      totalAmount += rate24h;
    }
    current.setDate(current.getDate() + 1);
  }

  const rateUsed = isWeekend() ? rate24h + 50 : rate24h;
  return { totalAmount, daysCount, weekendDaysCount, rateUsed };
}

/**
 * Strict Late Return Policy:
 * Overdue by even 1 minute = Billed full additional day charge!
 */
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

  const extraDays = Math.ceil(minutesLate / (24 * 60));
  const effectiveDailyRate = getDynamicRate24h(rate24h, actualReturn);
  const fee = extraDays * effectiveDailyRate;

  return {
    minutesLate,
    fee,
    breakdown: `Overdue by ${minutesLate} min — billed full extra day charge (₹${effectiveDailyRate}/day x ${extraDays} day${extraDays > 1 ? "s" : ""}).`,
  };
}
