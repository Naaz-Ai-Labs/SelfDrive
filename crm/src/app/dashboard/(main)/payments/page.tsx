import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { syncLatestFromSupabase } from "@/lib/hydrate-db";
import { PaymentsTableWithDrawer } from "@/components/dashboard/PaymentsTableWithDrawer";
import type { PaymentTransactionData } from "@/components/dashboard/PaymentDetailModal";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const db = getDb();
  await syncLatestFromSupabase(db);

  const rawRows = db
    .prepare(
      `SELECT p.*, b.booking_no, b.pickup_at, b.return_at,
              c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              v.name AS vehicle_name, v.registration_no
       FROM payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       ORDER BY p.created_at DESC, p.due_date IS NULL, p.due_date`
    )
    .all() as Array<Record<string, unknown>>;

  const payments: PaymentTransactionData[] = rawRows.map((p) => ({
    id: Number(p.id),
    payment_no: String(p.payment_no),
    booking_id: p.booking_id as number | null,
    booking_no: (p.booking_no as string) ?? null,
    customer_id: p.customer_id as number | null,
    customer_name: (p.customer_name as string) ?? null,
    customer_phone: (p.customer_phone as string) ?? null,
    customer_email: (p.customer_email as string) ?? null,
    vehicle_name: (p.vehicle_name as string) ?? null,
    registration_no: (p.registration_no as string) ?? null,
    pickup_at: (p.pickup_at as string) ?? null,
    return_at: (p.return_at as string) ?? null,
    amount: Number(p.amount ?? 0),
    amount_paise: Number(p.amount_paise ?? 0),
    currency: String(p.currency ?? "INR"),
    kind: String(p.kind ?? "advance"),
    method: (p.method as string) ?? null,
    gateway_ref: (p.gateway_ref as string) ?? null,
    razorpay_order_id: (p.razorpay_order_id as string) ?? null,
    razorpay_payment_id: (p.razorpay_payment_id as string) ?? null,
    razorpay_signature: (p.razorpay_signature as string) ?? null,
    due_date: (p.due_date as string) ?? null,
    paid_at: (p.paid_at as string) ?? null,
    status: String(p.status ?? "Pending"),
    notes: (p.notes as string) ?? null,
    receipt_no: (p.receipt_no as string) ?? null,
    created_at: (p.created_at as string) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Payments & Transactions</h1>
          <p className="mt-1 text-sm text-ink-500">
            Real-time Razorpay gateway transactions, deposits, online order IDs, and manual receipts.
          </p>
        </div>
      </div>

      <PaymentsTableWithDrawer initialPayments={payments} />
    </div>
  );
}
