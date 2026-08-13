import type { Metadata } from "next";
import Link from "next/link";
import { sbSelect, num } from "@/lib/supabase-rest";
import { formatDateTime, formatINR } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { RefundDecisionForm, CompleteRefundForm } from "@/components/dashboard/forms";

import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Refunds", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function RefundsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  if (user.role !== "admin") redirect("/dashboard");

  const refundsRes = await sbSelect<Record<string, unknown>>(
    "refunds",
    "select=*,bookings(booking_no),customers(name)&order=requested_at.desc"
  );
  if (!refundsRes.ok) throw new Error(`Could not load refunds: ${refundsRes.error}`);

  const refunds = refundsRes.data.map((r): Record<string, unknown> => ({
    ...r,
    booking_no: (r.bookings as { booking_no?: string } | null)?.booking_no ?? null,
    customer_name: (r.customers as { name?: string } | null)?.name ?? null,
    requested_amount: num(r.requested_amount),
    approved_amount: r.approved_amount === null || r.approved_amount === undefined ? null : num(r.approved_amount),
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Refunds</h1>
      {refunds.length === 0 && <EmptyState title="No refund requests" />}
      <div className="space-y-4">
        {refunds.map((r) => (
          <div key={Number(r.id)} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-900">{String(r.refund_no)} · {String(r.customer_name ?? "—")}</p>
                <Link href={`/dashboard/bookings/${Number(r.booking_id)}`} className="text-xs text-brand-700 hover:underline">{String(r.booking_no)}</Link>
                <p className="mt-1 text-sm text-ink-600">{String(r.reason)}</p>
                <p className="text-xs text-ink-400">Requested {formatDateTime(String(r.requested_at))} · Requested amount {formatINR(Number(r.requested_amount))}</p>
              </div>
              <StatusBadge status={String(r.status)} />
            </div>
            {["Requested", "Under review"].includes(String(r.status)) && (
              <div className="mt-4 border-t border-ink-100 pt-4"><RefundDecisionForm id={Number(r.id)} requested={Number(r.requested_amount)} /></div>
            )}
            {["Approved", "Partially approved"].includes(String(r.status)) && (
              <div className="mt-4 border-t border-ink-100 pt-4"><CompleteRefundForm id={Number(r.id)} /></div>
            )}
            {r.status === "Completed" && (
              <p className="mt-3 text-sm text-emerald-700">✓ Completed {formatDateTime(String(r.completed_at))} via {String(r.method)} ({String(r.transaction_ref)})</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
