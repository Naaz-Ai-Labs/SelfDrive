import { sbSelectOne, sbInsert, num } from "./supabase-rest";
import { nextNumber } from "./utils";
import { getSetting } from "./settings";

export type Invoice = {
  id: number;
  invoice_no: string;
  booking_id: number | null;
  customer_id: number | null;
  subtotal: number;
  tax_pct: number;
  discount: number;
  total: number;
  status: string;
};

/** Returns the existing invoice for a booking, or null. */
export async function getInvoiceForBooking(bookingId: number): Promise<Invoice | null> {
  const res = await sbSelectOne<Invoice>("invoices", `select=*&booking_id=eq.${bookingId}`);
  if (!res.ok) throw new Error(`Could not load the invoice: ${res.error}`);
  return res.data;
}

/** Generates (or returns the existing) tax invoice for a booking, itemising base rate,
 * off-schedule/late fees, GST and gateway fee — matching what the customer was quoted.
 *
 * Supabase is the system of record; the SQLite mirror is no longer written to. Money
 * columns arrive from PostgREST as NUMERIC strings, so every amount goes through num()
 * before arithmetic — plain `+` on them concatenates.
 */
export async function generateInvoiceForBooking(bookingRef: number | string): Promise<{ id: number; invoiceNo: string }> {
  const rawRef = String(bookingRef).trim();
  const filter = /^\d+$/.test(rawRef)
    ? `or=(id.eq.${rawRef},booking_no.eq.${rawRef},booking_no.eq.BK-${rawRef})`
    : `or=(booking_no.eq.${encodeURIComponent(rawRef)},booking_no.eq.${encodeURIComponent(rawRef.replace(/^BK-/i, ""))})`;

  const bookingRes = await sbSelectOne<Record<string, unknown>>("bookings", `select=*&${filter}`);
  if (!bookingRes.ok) throw new Error(`Could not load the booking: ${bookingRes.error}`);
  const booking = bookingRes.data;
  if (!booking) throw new Error(`Booking ${bookingRef} not found.`);

  const bookingId = Number(booking.id);
  const existing = await getInvoiceForBooking(bookingId);
  if (existing) return { id: Number(existing.id), invoiceNo: existing.invoice_no };

  const gstPct = await getSetting<number>("tax_pct", 6);

  const subtotal =
    num(booking.base_amount) +
    num(booking.other_fees_amount) +
    num(booking.extra_km_amount) +
    num(booking.late_fee_amount) +
    num(booking.damage_amount);
  const discount = num(booking.discount_amount);
  const total = subtotal + num(booking.gst_amount) - discount;

  const invoiceNo = nextNumber("INV", null);
  const insert = await sbInsert<Invoice>("invoices", {
    invoice_no: invoiceNo,
    booking_id: bookingId,
    customer_id: booking.customer_id === null || booking.customer_id === undefined ? null : Number(booking.customer_id),
    subtotal,
    tax_pct: num(gstPct),
    discount,
    total,
    status: "issued",
  });
  if (!insert.ok) throw new Error(`Could not create the invoice: ${insert.error}`);

  return { id: Number(insert.data.id), invoiceNo: insert.data.invoice_no ?? invoiceNo };
}
