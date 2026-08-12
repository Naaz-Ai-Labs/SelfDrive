import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { syncLatestFromSupabase } from "@/lib/hydrate-db";
import { BookingsTableWithTabs } from "@/components/dashboard/BookingsTableWithTabs";
import type { BookingReviewData, CustomerDocument } from "@/components/dashboard/BookingReviewModal";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function BookingsPage() {
  const db = getDb();
  await syncLatestFromSupabase(db);

  const rawRows = db
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

  const bookingIds = rawRows.map((r) => Number(r.id)).filter(Boolean);
  let allDocs: CustomerDocument[] = [];
  if (bookingIds.length > 0) {
    try {
      const placeholders = bookingIds.map(() => "?").join(",");
      allDocs = db
        .prepare(`SELECT * FROM customer_documents WHERE booking_id IN (${placeholders})`)
        .all(...bookingIds) as CustomerDocument[];
    } catch {}
  }

  const docsByBookingId = new Map<number, CustomerDocument[]>();
  for (const doc of allDocs) {
    const bId = Number((doc as any).booking_id);
    if (!docsByBookingId.has(bId)) docsByBookingId.set(bId, []);
    docsByBookingId.get(bId)!.push(doc);
  }

  const bookings: BookingReviewData[] = rawRows.map((r) => ({
    id: Number(r.id),
    booking_no: String(r.booking_no),
    customer_id: r.customer_id as number | null,
    customer_name: (r.customer_name as string) ?? null,
    customer_phone: (r.customer_phone as string) ?? null,
    customer_email: (r.customer_email as string) ?? null,
    vehicle_id: r.vehicle_id as number | null,
    vehicle_name: (r.vehicle_name as string) ?? null,
    registration_no: (r.registration_no as string) ?? null,
    pickup_at: String(r.pickup_at),
    return_at: String(r.return_at),
    status: String(r.status),
    base_amount: Number(r.base_amount ?? 0),
    surcharge_amount: Number(r.surcharge_amount ?? 0),
    gst_amount: Number(r.gst_amount ?? 0),
    deposit_amount: Number(r.deposit_amount ?? 0),
    total_amount: Number(r.total_amount ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    notes: (r.notes as string) ?? null,
    created_at: String(r.created_at ?? ""),
    documents: docsByBookingId.get(Number(r.id)) ?? [],
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
