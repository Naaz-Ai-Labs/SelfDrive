import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { getDb } from "@/lib/db";
import { businessInfo } from "@/lib/settings";
import { generateInvoiceForBooking, getInvoiceForBooking } from "@/lib/invoices";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingNo: string }> }) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const { bookingNo } = await params;
  const db = getDb();
  const booking = db
    .prepare(
      `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address,
              v.name AS vehicle_name, v.registration_no
       FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN vehicles v ON v.id = b.vehicle_id
       WHERE b.booking_no = ?`
    )
    .get(bookingNo) as Record<string, unknown> | undefined;
  if (!booking) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (customer.customerId && Number(booking.customer_id) !== customer.customerId) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  // Invoices live in Supabase now, not the SQLite mirror.
  let invoice = await getInvoiceForBooking(Number(booking.id));
  if (!invoice) {
    await generateInvoiceForBooking(Number(booking.id));
    invoice = await getInvoiceForBooking(Number(booking.id));
  }
  const photo = db.prepare("SELECT url FROM vehicle_photos WHERE vehicle_id = ? ORDER BY is_primary DESC, sort LIMIT 1").get(booking.vehicle_id as number) as { url: string } | undefined;

  return NextResponse.json({ booking, invoice: invoice ?? null, photoUrl: photo?.url ?? null, business: await businessInfo() });
}
