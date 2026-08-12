import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { syncLatestFromSupabase } from "@/lib/hydrate-db";
import { BookingsTableWithTabs } from "@/components/dashboard/BookingsTableWithTabs";
import type { BookingReviewData, CustomerDocument } from "@/components/dashboard/BookingReviewModal";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function BookingsPage() {
  const db = getDb();
  try {
    await Promise.race([syncLatestFromSupabase(db), new Promise((r) => setTimeout(r, 2000))]);
  } catch {}

  let rawRows: Array<Record<string, unknown>> = [];
  try {
    rawRows = db
      .prepare(
        `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
                v.name AS vehicle_name, v.registration_no, u.name AS manager_name
         FROM bookings b
         LEFT JOIN customers c ON c.id = b.customer_id
         LEFT JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.manager_id
         ORDER BY b.created_at DESC, b.pickup_at DESC LIMIT 200`
      )
      .all() as Array<Record<string, unknown>>;
  } catch (err) {
    console.error("Bookings query error:", err);
  }

  const bookingIds = rawRows.map((r) => Number(r.id)).filter(Boolean);
  let allDocs: CustomerDocument[] = [];
  let allPayments: any[] = [];
  if (bookingIds.length > 0) {
    try {
      const placeholders = bookingIds.map(() => "?").join(",");
      allDocs = db
        .prepare(`SELECT * FROM customer_documents WHERE booking_id IN (${placeholders})`)
        .all(...bookingIds) as CustomerDocument[];
      allPayments = db
        .prepare(`SELECT * FROM payments WHERE booking_id IN (${placeholders}) ORDER BY created_at DESC`)
        .all(...bookingIds);
    } catch {}
  }

  const docsByBookingId = new Map<number, CustomerDocument[]>();
  for (const doc of allDocs) {
    const bId = Number((doc as any).booking_id);
    if (!docsByBookingId.has(bId)) docsByBookingId.set(bId, []);
    docsByBookingId.get(bId)!.push(doc);
  }

  const paymentsByBookingId = new Map<number, any[]>();
  for (const pay of allPayments) {
    const bId = Number((pay as any).booking_id);
    if (!paymentsByBookingId.has(bId)) paymentsByBookingId.set(bId, []);
    paymentsByBookingId.get(bId)!.push(pay);
  }

  const bookings: BookingReviewData[] = rawRows.map((r) => ({
    id: Number(r.id),
    booking_no: r.booking_no ? String(r.booking_no) : `BK-${r.id}`,
    customer_id: r.customer_id ? Number(r.customer_id) : null,
    customer_name: (r.customer_name as string) ?? null,
    customer_phone: (r.customer_phone as string) ?? null,
    customer_email: (r.customer_email as string) ?? null,
    vehicle_id: r.vehicle_id ? Number(r.vehicle_id) : null,
    vehicle_name: (r.vehicle_name as string) ?? null,
    registration_no: (r.registration_no as string) ?? null,
    pickup_at: (r.pickup_at as string) ?? "2026-08-12T00:00:00.000Z",
    return_at: (r.return_at as string) ?? "2026-08-13T00:00:00.000Z",
    status: (r.status as string) ?? "Pending",
    base_amount: Number(r.base_amount ?? 0),
    surcharge_amount: Number(r.surcharge_amount ?? 0),
    gst_amount: Number(r.gst_amount ?? 0),
    deposit_amount: Number(r.deposit_amount ?? 0),
    total_amount: Number(r.total_amount ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    notes: (r.notes as string) ?? null,
    created_at: (r.created_at as string) ?? "2026-08-12T00:00:00.000Z",
    documents: (docsByBookingId.get(Number(r.id)) ?? []).map((d: any) => ({
      id: Number(d.id),
      kind: String(d.kind || "other"),
      number: d.number ? String(d.number) : null,
      expiry_date: d.expiry_date ? String(d.expiry_date) : null,
      file_path: String(d.file_path || ""),
      verified: Number(d.verified || 0),
      created_at: d.created_at ? String(d.created_at) : undefined,
    })),
    payments: (paymentsByBookingId.get(Number(r.id)) ?? []).map((p: any) => ({
      id: Number(p.id),
      booking_id: Number(p.booking_id || r.id),
      booking_no: r.booking_no ? String(r.booking_no) : `BK-${r.id}`,
      customer_name: (r.customer_name as string) ?? null,
      customer_phone: (r.customer_phone as string) ?? null,
      payment_no: String(p.payment_no || `PY-${p.id}`),
      amount: Number(p.amount || 0),
      status: String(p.status || "Pending"),
      method: String(p.method || "online"),
      kind: String(p.kind || "full"),
      notes: (p.notes as string) ?? null,
      created_at: (p.created_at as string) ?? "2026-08-12T00:00:00.000Z",
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Bookings Management</h1>
          <p className="mt-1 text-sm text-ink-500">
            Review customer bookings, inspect uploaded Driving Licences & Aadhaar IDs, and manage rejections.
          </p>
        </div>
      </div>

      <BookingsTableWithTabs initialBookings={bookings} />
    </div>
  );
}
