import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/utils";
import { Avatar, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const db = getDb();
  const sp = await searchParams;
  const q = sp.q ?? "";

  let sql = `SELECT c.*,
             (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id = c.id) AS lead_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS booking_count,
             (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.customer_id = c.id AND p.status = 'Paid') AS paid_total
             FROM customers c WHERE 1=1`;
  const params: Array<string> = [];
  if (q) {
    sql += " AND (c.id = ? OR c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.city LIKE ?)";
    const like = `%${q}%`;
    params.push(q, like, like, like, like);
  }
  sql += " ORDER BY c.created_at DESC LIMIT 100";

  let customers: Array<Record<string, unknown>> = [];
  try {
    customers = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  } catch (err) {
    console.error("Customers query error:", err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Customers</h1>
        <p className="mt-1 text-sm text-ink-500">One profile per customer — duplicates are merged automatically by phone or email.</p>
      </div>

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, phone, email…" className="input max-w-xs" aria-label="Search customers" />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {customers.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-500">No customers found.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">City</th>
                <th className="px-4 py-3 font-semibold">Enquiries</th>
                <th className="px-4 py-3 font-semibold">Bookings</th>
                <th className="px-4 py-3 font-semibold">Lifetime paid</th>
                <th className="px-4 py-3 font-semibold">Since</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={Number(c.id)} className="border-b border-ink-50 hover:bg-ink-50/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={String(c.name)} size="sm" />
                      <span className="font-semibold text-ink-900">{String(c.name)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    <p>{String(c.phone ?? "—")}</p>
                    <p className="text-xs text-ink-400">{String(c.email ?? "")}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{String(c.city ?? "—")}</td>
                  <td className="px-4 py-3 text-ink-700">{Number(c.lead_count)}</td>
                  <td className="px-4 py-3 text-ink-700">{Number(c.booking_count)}</td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{formatINR(Number(c.paid_total))}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(String(c.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
