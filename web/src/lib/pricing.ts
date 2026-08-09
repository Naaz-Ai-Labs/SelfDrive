/**
 * Live Clock Weekend Pricing Utility for Web Application
 * Automatically hikes prices by +₹50 on Saturdays & Sundays across Web & CRM.
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
  const daysCount = Math.max(1, Math.ceil(hours / 24));

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
