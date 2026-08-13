import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sbSelect, num } from "@/lib/supabase-rest";
import { formatINR, formatDateTime } from "@/lib/utils";
import { KpiCard, StatusBadge } from "@/components/ui";
import { AreaTrend } from "@/components/dashboard/charts/AreaTrend";
import { BarRows } from "@/components/dashboard/charts/BarRow";
import { PendingApprovalsInbox } from "@/components/dashboard/PendingApprovalsInbox";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const revalidate = 0;

const ICON = {
  vehicle: "M5 17h14M5 17a2 2 0 104 0M5 17V9l2-4h10l2 4v8M15 17a2 2 0 104 0",
  booking: "M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  clock: "M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  wrench: "M14.7 6.3a1 1 0 010 1.4l-1.6 1.6a3 3 0 11-4.4-4.4l1.6-1.6a1 1 0 011.4 0l3 3zM4 20l6-6M9 15l-5 5",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  enquiry: "M9 12h6M9 8h6M9 16h4M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16l-4-2-4 2-4-2-4 2z",
  alert: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.14A1.5 1.5 0 003.5 20h17a1.5 1.5 0 001.39-2l-8.18-14.14a1.5 1.5 0 00-2.62 0z",
  money: "₹",
  card: "M3 10h18M7 15h2m4 0h4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  shield: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z",
  refund: "M3 10h11a5 5 0 010 10H9M3 10l4-4M3 10l4 4",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");

  // Every panel on this page is derived from six table reads. Aggregating in memory
  // is what PostgREST leaves us; the volumes here are small enough that it is also
  // faster than the eighteen separate queries this replaces.
  const [vehiclesRes, bookingsRes, enquiriesRes, paymentsRes, refundsRes, ticketsRes, documentsRes] = await Promise.all([
    sbSelect<Record<string, unknown>>("vehicles", "select=id,name,total_units,status&active=eq.1"),
    sbSelect<Record<string, unknown>>(
      "bookings",
      "select=*,customers(name,phone,email),vehicles(name,registration_no)&order=created_at.desc"
    ),
    sbSelect<Record<string, unknown>>("enquiries", "select=*&order=created_at.desc"),
    sbSelect<Record<string, unknown>>("payments", "select=amount,status,paid_at"),
    sbSelect<Record<string, unknown>>("refunds", "select=*,customers(name),bookings(booking_no)&order=requested_at.desc"),
    sbSelect<Record<string, unknown>>("problem_tickets", "select=*&order=created_at.desc"),
    sbSelect<Record<string, unknown>>(
      "customer_documents",
      "select=*,customers(name),bookings(booking_no)&order=created_at.desc"
    ),
  ]);

  for (const [label, res] of [
    ["fleet", vehiclesRes],
    ["bookings", bookingsRes],
    ["enquiries", enquiriesRes],
    ["payments", paymentsRes],
    ["refunds", refundsRes],
    ["problem tickets", ticketsRes],
    ["customer documents", documentsRes],
  ] as const) {
    if (!res.ok) throw new Error(`Could not load ${label}: ${res.error}`);
  }

  const vehicleRows = vehiclesRes.ok ? vehiclesRes.data : [];
  const rawBookings = bookingsRes.ok ? bookingsRes.data : [];
  const enquiryRows = enquiriesRes.ok ? enquiriesRes.data : [];
  const paymentRows = paymentsRes.ok ? paymentsRes.data : [];
  const refundRows = refundsRes.ok ? refundsRes.data : [];
  const ticketRows = ticketsRes.ok ? ticketsRes.data : [];
  const documentRows = documentsRes.ok ? documentsRes.data : [];

  const flatten = (row: Record<string, unknown>): Record<string, unknown> => {
    const customer = row.customers as { name?: string; phone?: string; email?: string } | null;
    const vehicle = row.vehicles as { name?: string; registration_no?: string } | null;
    const booking = row.bookings as { booking_no?: string } | null;
    return {
      ...row,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      customer_email: customer?.email ?? null,
      vehicle_name: vehicle?.name ?? null,
      registration_no: vehicle?.registration_no ?? null,
      booking_no: booking?.booking_no ?? row.booking_no ?? null,
    };
  };

  const bookings = rawBookings.map(flatten);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const statusOf = (row: Record<string, unknown>) => String(row.status ?? "");
  // num() throughout: these are NUMERIC columns and PostgREST sends them as strings.
  const sum = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce((acc, r) => acc + num(r[key]), 0);

  const HOLDING = new Set(["Confirmed", "Ready for pickup", "Vehicle handed over", "Active rental", "Return pending"]);
  const OUT = new Set(["Vehicle handed over", "Active rental"]);

  const totalFleetUnits = vehicleRows.reduce((acc, v) => acc + num(v.total_units, 1), 0);
  const maintUnits = vehicleRows.filter((v) => v.status === "maintenance").reduce((acc, v) => acc + num(v.total_units, 1), 0);
  const bookedUnits = bookings.filter((b) => HOLDING.has(statusOf(b)) && String(b.return_at ?? "") >= nowIso).length;
  const availableFleetUnits = Math.max(0, totalFleetUnits - bookedUnits - maintUnits);

  const todaysPickups = { c: bookings.filter((b) => String(b.pickup_at ?? "").slice(0, 10) === today && !["Cancelled", "Rejected"].includes(statusOf(b))).length };
  const todaysReturns = { c: bookings.filter((b) => String(b.return_at ?? "").slice(0, 10) === today && OUT.has(statusOf(b))).length };
  const overdueBookings = bookings.filter((b) => OUT.has(statusOf(b)) && String(b.return_at ?? "") < nowIso);
  const overdueReturns = { c: overdueBookings.length };
  const activeRentals = { c: bookedUnits };

  const newEnquiries = { c: enquiryRows.filter((e) => String(e.created_at ?? "").slice(0, 10) === today).length };
  const pendingPayments = { t: sum(paymentRows.filter((p) => p.status === "Pending"), "amount") };
  const pendingDeposits = { t: sum(bookings.filter((b) => ["Vehicle handed over", "Active rental", "Return pending"].includes(statusOf(b))), "deposit_amount") };
  const openRefunds = refundRows.filter((r) => ["Requested", "Under review"].includes(String(r.status)));
  const pendingRefunds = { c: openRefunds.length };
  const paidPayments = paymentRows.filter((p) => p.status === "Paid");
  const revenue = { t: sum(paidPayments, "amount") };
  const openTicketRows = ticketRows.filter((t) => t.status === "Open");
  const openTickets = { c: openTicketRows.length };

  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthDate = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
  const lastMonthStart = lastMonthDate.toISOString().slice(0, 10);
  const paidOn = (p: Record<string, unknown>) => String(p.paid_at ?? "").slice(0, 10);
  const revenueThisMonth = { t: sum(paidPayments.filter((p) => paidOn(p) >= monthStart), "amount") };
  const revenueLastMonth = { t: sum(paidPayments.filter((p) => paidOn(p) >= lastMonthStart && paidOn(p) < monthStart), "amount") };
  const revenueTrend: { pct: number; positive: boolean } | undefined =
    revenueLastMonth.t > 0
      ? { pct: Math.round(((revenueThisMonth.t - revenueLastMonth.t) / revenueLastMonth.t) * 100), positive: revenueThisMonth.t >= revenueLastMonth.t }
      : revenueThisMonth.t > 0
        ? { pct: 100, positive: true }
        : undefined;

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const monthlyBookings: Array<{ label: string; value: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyBookings.push({
      label: MONTH_NAMES[d.getMonth()],
      value: bookings.filter((b) => String(b.created_at ?? "").slice(0, 7) === monthStr).length,
    });
  }

  const sourceCounts = new Map<string, number>();
  for (const e of enquiryRows) {
    const key = String(e.source ?? "Unknown") || "Unknown";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const enquirySources = [...sourceCounts.entries()]
    .map(([source, c]) => ({ source, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 6);

  const recentEnquiries = enquiryRows.slice(0, 8);

  const upcomingBookings = bookings
    .filter((b) => !["Completed", "Cancelled", "Rejected"].includes(statusOf(b)))
    .sort((a, b) => String(a.pickup_at ?? "").localeCompare(String(b.pickup_at ?? "")))
    .slice(0, 6);

  const attentionTickets = openTicketRows.slice(0, 5).map((t) => ({
    ticket_no: String(t.ticket_no),
    category: String(t.category),
    description: String(t.description),
    created_at: String(t.created_at),
  }));
  const attentionRefunds = openRefunds.slice(0, 5).map((r) => ({
    refund_no: String(r.refund_no),
    requested_amount: num(r.requested_amount),
    status: String(r.status),
    requested_at: String(r.requested_at),
  }));
  const attentionOverdue = [...overdueBookings]
    .sort((a, b) => String(a.return_at ?? "").localeCompare(String(b.return_at ?? "")))
    .slice(0, 5)
    .map((b) => ({
      id: Number(b.id),
      booking_no: String(b.booking_no),
      vehicle_name: (b.vehicle_name as string | null) ?? null,
      return_at: String(b.return_at),
    }));

  const documents = documentRows.map(flatten);
  const docsByBooking = new Map<number, Array<Record<string, unknown>>>();
  for (const d of documents) {
    const key = Number(d.booking_id);
    if (!Number.isFinite(key)) continue;
    const list = docsByBooking.get(key) ?? [];
    list.push(d);
    docsByBooking.set(key, list);
  }

  const PENDING_REVIEW = new Set(["Pending", "Pending verification", "Payment received", "Enquiry", "Draft"]);

  /**
   * A booking only needs staff attention once the customer has actually paid.
   *
   * The website creates the booking row at the review step, BEFORE Razorpay runs, so
   * every visitor who reaches step 5 and walks away leaves a permanent "Pending
   * verification" entry. Those were burying the real queue.
   *
   * Nothing is deleted — the rows stay, and every other CRM screen still shows them.
   * This is the action inbox, so it lists work that is actually actionable.
   *
   * The manager_id escape hatch matters: if a staff member has taken ownership of a
   * booking, it stays visible even at zero payment, so a walk-in or cash-at-pickup
   * booking your team is handling can never disappear from their own queue.
   */
  const awaitingPayment = (b: Record<string, unknown>) =>
    num(b.paid_amount) <= 0 && !b.manager_id;

  // These four feed a client component with its own row types; the shapes are
  // validated there, so they stay loosely typed on the way across, as before.
  const pendingBookings: any[] = bookings
    .filter((b) => PENDING_REVIEW.has(statusOf(b)) && !awaitingPayment(b))
    .map((b): Record<string, unknown> => ({ ...b, documents: docsByBooking.get(Number(b.id)) ?? [] }));

  const pendingDocs: any[] = documents.filter((d) => num(d.verified) === 0);
  const pendingAfterHours: any[] = bookings.filter((b) => num(b.after_hours) === 1 && !b.after_hours_approved_by);
  const pendingRefundsData: any[] = openRefunds.map(flatten);

  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Good day, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-500">Here is the fleet and bookings status at a glance.</p>
      </div>

      <PendingApprovalsInbox
        pendingBookings={pendingBookings}
        pendingDocs={pendingDocs}
        pendingAfterHours={pendingAfterHours}
        pendingRefunds={pendingRefundsData}
        isAdmin={user.role === "admin"}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Fleet Units" value={`${totalFleetUnits} Units`} hint={`${availableFleetUnits} available`} accent="brand" href="/dashboard/vehicles" icon={ICON.vehicle} />
        <KpiCard label="Active rentals" value={String(activeRentals.c)} hint={`${bookedUnits} vehicle units out`} accent="ink" href="/dashboard/bookings" icon={ICON.booking} />
        <KpiCard label="Overdue returns" value={String(overdueReturns.c)} hint="past scheduled return" accent={overdueReturns.c > 0 ? "red" : "ink"} href="/dashboard/bookings" icon={ICON.clock} />
        <KpiCard label="Under maintenance" value={String(maintUnits)} hint="units in service" accent="amber" href="/dashboard/vehicles" icon={ICON.wrench} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Today's pickups" value={String(todaysPickups.c)} accent="brand" href="/dashboard/bookings" icon={ICON.arrowUp} />
        <KpiCard label="Today's returns" value={String(todaysReturns.c)} accent="brand" href="/dashboard/bookings" icon={ICON.arrowDown} />
        <KpiCard label="New enquiries today" value={String(newEnquiries.c)} accent="ink" href="/dashboard/enquiries" icon={ICON.enquiry} />
        <KpiCard label="Open problem tickets" value={String(openTickets.c)} accent={openTickets.c > 0 ? "red" : "ink"} href="/dashboard/problem-tickets" icon={ICON.alert} />
      </div>
      {isAdmin && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <KpiCard label="Revenue collected" value={formatINR(revenue.t)} accent="emerald" icon={ICON.money} trend={revenueTrend} hint="vs last month" />
          <KpiCard label="Payments pending" value={formatINR(pendingPayments.t)} accent={pendingPayments.t > 0 ? "amber" : "ink"} href="/dashboard/payments" icon={ICON.card} />
          <KpiCard label="Deposits held" value={formatINR(pendingDeposits.t)} accent="ink" icon={ICON.shield} />
          <KpiCard label="Refunds pending" value={String(pendingRefunds.c)} accent={pendingRefunds.c > 0 ? "amber" : "ink"} href="/dashboard/refunds" icon={ICON.refund} />
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {isAdmin ? (
          <div className="card p-4 sm:p-5 lg:col-span-2">
            <h2 className="font-display text-base sm:text-lg font-semibold text-ink-900">Bookings trend</h2>
            <p className="text-xs sm:text-sm text-ink-500">New bookings created per month.</p>
            <div className="mt-4" style={{ ["--chart-accent" as string]: "#f2b705" }}>
              <AreaTrend data={monthlyBookings} />
            </div>
          </div>
        ) : (
          <div className="card p-4 sm:p-5 lg:col-span-2 bg-brand-50/20 border border-brand-100">
            <h2 className="font-display text-base sm:text-lg font-semibold text-ink-900">Operations Checklist</h2>
            <p className="text-xs sm:text-sm text-ink-500">Daily operational workflow for vehicle handovers and returns.</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <Link href="/dashboard/bookings" className="rounded-xl border border-ink-200 bg-white p-3 hover:border-brand-500">
                <p className="font-bold text-sm text-ink-900">📋 Pickup & Handover</p>
                <p className="text-xs text-ink-500">Verify customer DL, Aadhaar & complete vehicle inspection.</p>
              </Link>
              <Link href="/dashboard/bookings" className="rounded-xl border border-ink-200 bg-white p-3 hover:border-brand-500">
                <p className="font-bold text-sm text-ink-900">🛵 Vehicle Return</p>
                <p className="text-xs text-ink-500">Check return odometer, fuel level & extra km calculations.</p>
              </Link>
            </div>
          </div>
        )}
        <div className="card p-4 sm:p-5">
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink-900">Enquiry sources</h2>
          <p className="text-xs sm:text-sm text-ink-500">Where enquiries come from.</p>
          <div className="mt-4">
            <BarRows data={enquirySources.map((s) => ({ label: s.source, value: s.c }))} />
          </div>
        </div>
      </div>

      {(attentionTickets.length > 0 || attentionRefunds.length > 0 || attentionOverdue.length > 0) && (
        <div className="card border-red-100 bg-red-50/40 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Needs attention</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {attentionOverdue.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Overdue returns</p>
                <ul className="mt-2 space-y-1.5">
                  {attentionOverdue.map((b) => (
                    <li key={b.id}>
                      <Link href={`/dashboard/bookings/${b.id}`} className="text-sm text-ink-700 hover:text-brand-700 hover:underline">
                        {b.booking_no} · {b.vehicle_name ?? "—"} — due {formatDateTime(b.return_at)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {attentionTickets.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Open problem tickets</p>
                <ul className="mt-2 space-y-1.5">
                  {attentionTickets.map((t) => (
                    <li key={t.ticket_no}>
                      <Link href="/dashboard/problem-tickets" className="text-sm text-ink-700 hover:text-brand-700 hover:underline">
                        {t.ticket_no} · {t.category.replace("_", " ")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {attentionRefunds.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Refunds awaiting review</p>
                <ul className="mt-2 space-y-1.5">
                  {attentionRefunds.map((r) => (
                    <li key={r.refund_no}>
                      <Link href="/dashboard/refunds" className="text-sm text-ink-700 hover:text-brand-700 hover:underline">
                        {r.refund_no} · {formatINR(r.requested_amount)} · {r.status}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Recent enquiries</h2>
            <Link href="/dashboard/enquiries" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
          </div>
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                  <th className="px-4 py-3 font-semibold">Enquiry</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Pickup</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                </tr>
              </thead>
              <tbody>
                {recentEnquiries.map((e) => (
                  <tr key={Number(e.id)} className="border-b border-ink-50 hover:bg-ink-50/40">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/enquiries/${Number(e.id)}`} className="font-semibold text-ink-900 hover:text-brand-700">{String(e.enquiry_no)}</Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{String(e.name ?? "—")}</td>
                    <td className="px-4 py-3 text-ink-500">{e.pickup_date ? formatDateTime(String(e.pickup_date)) : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={String(e.stage ?? "New")} /></td>
                  </tr>
                ))}
                {recentEnquiries.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-400">No enquiries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Upcoming bookings</h2>
            <Link href="/dashboard/bookings" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {upcomingBookings.length === 0 && <p className="text-sm text-ink-400">No upcoming bookings.</p>}
            {upcomingBookings.map((b) => (
              <Link key={Number(b.id)} href={`/dashboard/bookings/${Number(b.id)}`} className="card flex items-center justify-between gap-3 p-4 transition hover:shadow-lift">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{String(b.vehicle_name ?? "—")}</p>
                  <p className="text-xs text-ink-400">{String(b.booking_no)} · {formatDateTime(String(b.pickup_at))}</p>
                </div>
                <StatusBadge status={String(b.status)} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
