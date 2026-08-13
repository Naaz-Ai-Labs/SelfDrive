import type { Metadata } from "next";
import { sbSelect, num } from "@/lib/supabase-rest";
import { BookingsTableWithTabs } from "@/components/dashboard/BookingsTableWithTabs";
import type { BookingReviewData, CustomerDocument } from "@/components/dashboard/BookingReviewModal";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function BookingsPage() {
  // bookings references users twice (manager_id, after_hours_approved_by), so the
  // manager name cannot be embedded; it is not rendered by this table anyway.
  const bookingsRes = await sbSelect<Record<string, unknown>>(
    "bookings",
    "select=*,customers(name,phone,email),vehicles(name,registration_no)&order=created_at.desc,pickup_at.desc&limit=200"
  );
  if (!bookingsRes.ok) throw new Error(`Could not load bookings: ${bookingsRes.error}`);

  const rawRows = bookingsRes.data.map((r): Record<string, unknown> => {
    const customer = r.customers as { name?: string; phone?: string; email?: string } | null;
    const vehicle = r.vehicles as { name?: string; registration_no?: string } | null;
    return {
      ...r,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      customer_email: customer?.email ?? null,
      vehicle_name: vehicle?.name ?? null,
      registration_no: vehicle?.registration_no ?? null,
    };
  });

  const bookingIds = rawRows.map((r) => Number(r.id)).filter(Boolean);
  let allDocs: CustomerDocument[] = [];
  let allPayments: any[] = [];
  if (bookingIds.length > 0) {
    const idList = `in.(${bookingIds.join(",")})`;
    const [docsRes, paymentsRes] = await Promise.all([
      sbSelect<CustomerDocument>("customer_documents", `select=*&booking_id=${idList}`),
      sbSelect<Record<string, unknown>>("payments", `select=*&booking_id=${idList}&order=created_at.desc`),
    ]);
    if (!docsRes.ok) throw new Error(`Could not load customer documents: ${docsRes.error}`);
    if (!paymentsRes.ok) throw new Error(`Could not load payments: ${paymentsRes.error}`);
    allDocs = docsRes.data;
    allPayments = paymentsRes.data;
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
    // PostgREST returns NUMERIC as a string; num() keeps these additive.
    base_amount: num(r.base_amount),
    surcharge_amount: num(r.surcharge_amount),
    gst_amount: num(r.gst_amount),
    deposit_amount: num(r.deposit_amount),
    total_amount: num(r.total_amount),
    paid_amount: num(r.paid_amount),
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
      amount: num(p.amount),
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
