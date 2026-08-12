"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatDateTime, formatINR, waLink } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { PaymentDetailModal, type PaymentTransactionData } from "./PaymentDetailModal";
import { markPaymentPaid } from "@/lib/actions";

export function PaymentsTableWithDrawer({
  initialPayments,
}: {
  initialPayments: PaymentTransactionData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"all" | "paid" | "pending" | "deposits">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransactionData | null>(null);

  const allCount = initialPayments.length;
  const paidCount = initialPayments.filter((p) => p.status === "Paid").length;
  const pendingCount = initialPayments.filter((p) => ["Pending", "Partially paid"].includes(p.status)).length;
  const depositCount = initialPayments.filter((p) => p.kind === "deposit" || p.kind === "extra_charge").length;

  const totalPaid = initialPayments
    .filter((p) => p.status === "Paid")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = initialPayments
    .filter((p) => ["Pending", "Partially paid"].includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);

  const filteredPayments = useMemo(() => {
    let list = initialPayments;

    if (activeTab === "paid") {
      list = list.filter((p) => p.status === "Paid");
    } else if (activeTab === "pending") {
      list = list.filter((p) => ["Pending", "Partially paid"].includes(p.status));
    } else if (activeTab === "deposits") {
      list = list.filter((p) => p.kind === "deposit" || p.kind === "extra_charge");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.payment_no.toLowerCase().includes(q) ||
          (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
          (p.customer_phone && p.customer_phone.toLowerCase().includes(q)) ||
          (p.booking_no && p.booking_no.toLowerCase().includes(q)) ||
          (p.razorpay_payment_id && p.razorpay_payment_id.toLowerCase().includes(q)) ||
          (p.method && p.method.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [initialPayments, activeTab, searchQuery]);

  function handleQuickMarkPaid(e: React.MouseEvent, paymentId: number) {
    e.stopPropagation();
    startTransition(async () => {
      await markPaymentPaid(paymentId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary KPI Pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3 bg-emerald-50/50 border-emerald-200">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Collected Revenue</span>
          <p className="font-display text-xl font-bold text-emerald-950 mt-0.5">{formatINR(totalPaid)}</p>
        </div>
        <div className="card p-3 bg-amber-50/50 border-amber-200">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Pending Dues</span>
          <p className="font-display text-xl font-bold text-amber-950 mt-0.5">{formatINR(totalPending)}</p>
        </div>
        <div className="card p-3">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">Total Transactions</span>
          <p className="font-display text-xl font-bold text-ink-900 mt-0.5">{allCount} Records</p>
        </div>
        <div className="card p-3">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">Paid Rate</span>
          <p className="font-display text-xl font-bold text-brand-700 mt-0.5">
            {allCount > 0 ? Math.round((paidCount / allCount) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Toolbar: Navigation Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-ink-200 bg-white p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === "all"
                ? "bg-ink-950 text-white shadow-xs"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            All Transactions ({allCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("paid")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === "paid"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            <span>Paid ({paidCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === "pending"
                ? "bg-amber-500 text-white shadow-xs"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            <span>Pending Dues</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
              activeTab === "pending" ? "bg-white text-amber-700" : "bg-amber-100 text-amber-900"
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("deposits")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === "deposits"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            Deposits & Extras ({depositCount})
          </button>
        </nav>

        {/* Search Box */}
        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Search payment #, customer, booking, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-hidden"
          />
          <span className="absolute left-2.5 top-2 text-xs text-ink-400">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1.5 text-xs text-ink-400 hover:text-ink-900"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Payments Table */}
      {filteredPayments.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-500 space-y-1">
          <p className="font-semibold">No payment records found</p>
          <p className="text-xs text-ink-400">
            {searchQuery ? "No payments matched your search query." : "No transactions in this category."}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto shadow-xs">
          <div className="bg-ink-50/50 px-4 py-2 border-b border-ink-100 flex items-center justify-between text-xs text-ink-600">
            <span>Showing {filteredPayments.length} transactions</span>
            <span className="text-[11px] text-ink-400">Click any row to view complete transaction details</span>
          </div>

          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-xs uppercase tracking-wider text-ink-400">
                <th className="px-4 py-3 font-semibold">Payment / Ref</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Booking / Vehicle</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Date / Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => {
                const isPaid = p.status === "Paid";
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedPayment(p)}
                    className="cursor-pointer border-b border-ink-50 hover:bg-brand-50/20 transition group"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-ink-900 group-hover:text-brand-700 hover:underline">
                        {p.payment_no}
                      </p>
                      {p.razorpay_payment_id ? (
                        <p className="font-mono text-[11px] text-brand-700 truncate max-w-[140px]">
                          {p.razorpay_payment_id}
                        </p>
                      ) : p.receipt_no ? (
                        <p className="text-[11px] text-ink-400 font-mono">Rec: {p.receipt_no}</p>
                      ) : (
                        <p className="text-[11px] text-ink-400 capitalize">{p.kind}</p>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-ink-900">{p.customer_name ?? "—"}</p>
                      {p.customer_phone && (
                        <span className="text-xs text-ink-500 font-mono">{p.customer_phone}</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {p.booking_id ? (
                        <div>
                          <Link
                            href={`/dashboard/bookings/${p.booking_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-brand-700 hover:underline inline-block"
                          >
                            {p.booking_no ?? `#${p.booking_id}`}
                          </Link>
                          {p.vehicle_name && (
                            <p className="text-[11px] text-ink-500">{p.vehicle_name}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <p className="font-bold text-ink-900">{formatINR(p.amount)}</p>
                      <span className="text-[10px] font-semibold text-ink-400 uppercase">{p.kind}</span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-800">
                        {p.method ?? "Online"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-ink-600">
                      {isPaid && p.paid_at ? (
                        <div>
                          <span className="text-emerald-700 font-medium">Paid</span>
                          <p className="text-[11px] text-ink-400">{formatDateTime(p.paid_at)}</p>
                        </div>
                      ) : p.due_date ? (
                        <div>
                          <span className="text-amber-700 font-medium">Due</span>
                          <p className="text-[11px] text-ink-400">{formatDate(p.due_date)}</p>
                        </div>
                      ) : (
                        formatDateTime(p.created_at || "")
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <StatusBadge status={p.status} />
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPayment(p);
                        }}
                        className="btn-secondary px-3 py-1 text-xs font-semibold bg-brand-50 text-brand-900 border-brand-200 hover:bg-brand-100"
                      >
                        Details 🔍
                      </button>

                      {!isPaid && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={(e) => handleQuickMarkPaid(e, p.id)}
                          className="btn-primary px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                        >
                          Mark Paid ✓
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction Detail Slide-Over Drawer */}
      <PaymentDetailModal
        payment={selectedPayment}
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
}
