import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { formatDateTime, formatINR } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };
export const revalidate = 0;

export default function BookingsPage() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT b.*, c.name AS customer_name, v.name AS vehicle_name, u.name AS manager_name
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN users u ON u.id = b.manager_id
       ORDER BY b.pickup_at DESC LIMIT 150`
    )
    .all() as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Bookings</h1>
        <p className="mt-1 text-sm text-ink-500">Every booking from pending verification through to completion.</p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-500">No bookings yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Pickup</th>
                <th className="px-4 py-3 font-semibold">Return</th>
                <th className="px-4 py-3 font-semibold">Paid / Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={Number(b.id)} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-4 py-3"><Link href={`/dashboard/bookings/${Number(b.id)}`} className="font-semibold text-ink-900 hover:text-brand-700">{String(b.booking_no)}</Link></td>
                  <td className="px-4 py-3 text-ink-700">{String(b.customer_name ?? "—")}</td>
                  <td className="px-4 py-3 text-ink-600">{String(b.vehicle_name ?? "—")}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDateTime(String(b.pickup_at ?? ""))}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDateTime(String(b.return_at ?? ""))}</td>
                  <td className="px-4 py-3 font-medium text-ink-800">{formatINR(Number(b.paid_amount))} / {formatINR(Number(b.total_amount))}</td>
                  <td className="px-4 py-3"><StatusBadge status={String(b.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
