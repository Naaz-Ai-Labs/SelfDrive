import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = getDb();
  const enquiries = db
    .prepare(
      `SELECT e.*, c.name AS category_name FROM enquiries e
       LEFT JOIN vehicle_categories c ON c.id = e.category_id
       WHERE (e.phone = ? OR e.email = ?)
       ORDER BY e.created_at DESC LIMIT 10`
    )
    .all(customer.target, customer.target.toLowerCase().trim()) as Array<Record<string, unknown>>;

  const bookings = customer.customerId
    ? (db
        .prepare(`SELECT b.*, v.name AS vehicle_name FROM bookings b LEFT JOIN vehicles v ON v.id = b.vehicle_id WHERE b.customer_id = ? ORDER BY b.created_at DESC`)
        .all(customer.customerId) as Array<Record<string, unknown>>)
    : [];

  const bookingIds = bookings.map((b) => Number(b.id));
  const payments = bookingIds.length
    ? (db.prepare(`SELECT * FROM payments WHERE booking_id IN (${bookingIds.map(() => "?").join(",")}) ORDER BY due_date`).all(...bookingIds) as Array<Record<string, unknown>>)
    : [];
  const documents = bookingIds.length
    ? (db.prepare(`SELECT * FROM customer_documents WHERE booking_id IN (${bookingIds.map(() => "?").join(",")})`).all(...bookingIds) as Array<Record<string, unknown>>)
    : [];

  return NextResponse.json({ target: customer.target, enquiries, bookings, payments, documents });
}
