/**
 * Rupee/Paise conversion helpers used by the payment write path.
 *
 * The SQLite mirror this file once supported has been removed; payments,
 * payment events and the webhook idempotency record are written straight to
 * Supabase (see `payment-actions.ts` and the Razorpay webhook route).
 */

/** Convert Rupees float to integer minor units (Paise). e.g. ₹1500.00 -> 150000 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert integer minor units (Paise) to Rupees float. e.g. 150000 -> 1500 */
export function toRupees(paise: number): number {
  return paise / 100;
}
