import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT p.*, b.booking_no, c.name AS customer_name
       FROM payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN customers c ON c.id = p.customer_id
       ORDER BY p.due_date IS NULL, p.due_date`
    )
    .all() as Array<Record<string, unknown>>;

  const totalPending = rows.filter((p) => ["Pending", "Partially paid"].includes(String(p.status))).reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = rows.filter((p) => String(p.status) === "Paid").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Payments</h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatINR(totalPaid)} collected · {formatINR(totalPending)} pending
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-500">No payments yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={Number(p.id)} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{String(p.payment_no)}</p>
                    <p className="text-xs text-ink-400">{String(p.notes ?? "")} {p.receipt_no ? `· ${String(p.receipt_no)}` : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{String(p.customer_name ?? "—")}</td>
                  <td className="px-4 py-3">
                    {p.booking_id ? <Link href={`/dashboard/bookings/${Number(p.booking_id)}`} className="font-medium text-brand-700 hover:underline">{String(p.booking_no)}</Link> : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink-900">{formatINR(Number(p.amount))}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(String(p.due_date ?? ""))}</td>
                  <td className="px-4 py-3"><StatusBadge status={String(p.status)} /></td>
                  <td className="px-4 py-3">
                    {String(p.status) !== "Paid" ? (
                      <form
                        action={async () => {
                          "use server";
                          const { markPaymentPaid } = await import("@/lib/actions");
                          await markPaymentPaid(Number(p.id));
                        }}
                      >
                        <button type="submit" className="btn-primary px-3 py-1.5 text-xs">Mark paid</button>
                      </form>
                    ) : (
                      <span className="text-xs text-ink-400">{formatDate(String(p.paid_at ?? ""))}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
