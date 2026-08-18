import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sbSelect, num } from "@/lib/supabase-rest";
import { formatDate, formatINR } from "@/lib/utils";
import { Avatar, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  const sp = await searchParams;
  const q = sp.q ?? "";

  let filter = "";
  if (q) {
    const like = `*${q}*`;
    const predicates = [`name.ilike.${like}`, `phone.ilike.${like}`, `email.ilike.${like}`, `city.ilike.${like}`];
    const asId = Number(q);
    if (Number.isInteger(asId) && asId > 0) predicates.unshift(`id.eq.${asId}`);
    filter = `&or=${encodeURIComponent(`(${predicates.join(",")})`)}`;
  }

  const customersRes = await sbSelect<Record<string, unknown>>(
    "customers",
    `select=*${filter}&order=created_at.desc&limit=100`
  );
  if (!customersRes.ok) throw new Error(`Could not load customers: ${customersRes.error}`);

  const customerIds = customersRes.data.map((c) => Number(c.id)).filter(Boolean);

  // The three per-customer aggregates were correlated subqueries in SQL. PostgREST
  // has no equivalent, so the related rows are fetched once for the visible page and
  // counted here — one round trip each instead of three per customer.
  let enquiryOwners: Array<{ customer_id: number }> = [];
  let bookingOwners: Array<{ customer_id: number }> = [];
  let paidPayments: Array<{ customer_id: number; amount: unknown }> = [];

  if (customerIds.length > 0) {
    const idList = `in.(${customerIds.join(",")})`;
    const [enquiriesRes, bookingsRes, paymentsRes] = await Promise.all([
      sbSelect<{ customer_id: number }>("enquiries", `select=customer_id&customer_id=${idList}`),
      sbSelect<{ customer_id: number }>("bookings", `select=customer_id&customer_id=${idList}`),
      sbSelect<{ customer_id: number; amount: unknown }>(
        "payments",
        `select=customer_id,amount&customer_id=${idList}&status=eq.Paid`
      ),
    ]);
    if (!enquiriesRes.ok) throw new Error(`Could not load enquiry counts: ${enquiriesRes.error}`);
    if (!bookingsRes.ok) throw new Error(`Could not load booking counts: ${bookingsRes.error}`);
    if (!paymentsRes.ok) throw new Error(`Could not load payment totals: ${paymentsRes.error}`);
    enquiryOwners = enquiriesRes.data;
    bookingOwners = bookingsRes.data;
    paidPayments = paymentsRes.data;
  }

  const tally = (rows: Array<{ customer_id: number }>) => {
    const out = new Map<number, number>();
    for (const row of rows) out.set(Number(row.customer_id), (out.get(Number(row.customer_id)) ?? 0) + 1);
    return out;
  };
  const leadCounts = tally(enquiryOwners);
  const bookingCounts = tally(bookingOwners);
  const paidTotals = new Map<number, number>();
  for (const p of paidPayments) {
    const key = Number(p.customer_id);
    // num() matters here: without it these amounts concatenate into "500700900".
    paidTotals.set(key, (paidTotals.get(key) ?? 0) + num(p.amount));
  }

  const customers = customersRes.data.map((c): Record<string, unknown> => ({
    ...c,
    lead_count: leadCounts.get(Number(c.id)) ?? 0,
    booking_count: bookingCounts.get(Number(c.id)) ?? 0,
    paid_total: paidTotals.get(Number(c.id)) ?? 0,
  }));

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
