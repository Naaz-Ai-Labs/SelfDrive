import { getDb } from "./db";
import { nextNumber } from "./utils";
import { getSetting } from "./settings";

/** Generates (or returns the existing) tax invoice for a booking, itemising base rate,
 * off-schedule/late fees, GST and gateway fee — matching what the customer was quoted. */
export function generateInvoiceForBooking(bookingId: number): { id: number; invoiceNo: string } {
  const db = getDb();
  const existing = db.prepare("SELECT id, invoice_no FROM invoices WHERE booking_id = ?").get(bookingId) as { id: number; invoice_no: string } | undefined;
  if (existing) return { id: existing.id, invoiceNo: existing.invoice_no };

  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as Record<string, unknown>;
  const gstPct = getSetting<number>("tax_pct", 6);
  const subtotal = Number(booking.base_amount) + Number(booking.other_fees_amount) + Number(booking.extra_km_amount) + Number(booking.late_fee_amount) + Number(booking.damage_amount);
  const total = subtotal + Number(booking.gst_amount) - Number(booking.discount_amount);

  const invoiceNo = nextNumber("INV", null);
  const result = db
    .prepare("INSERT INTO invoices (invoice_no, booking_id, customer_id, subtotal, tax_pct, discount, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')")
    .run(invoiceNo, bookingId, booking.customer_id as number | null, subtotal, gstPct, Number(booking.discount_amount), total);

  return { id: Number(result.lastInsertRowid), invoiceNo };
}
