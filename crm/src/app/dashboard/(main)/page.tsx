import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
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

  // Safe defaults for all dashboard KPI stats
  let totalFleetUnits = 33, availableFleetUnits = 33, bookedUnits = 0, maintUnits = 0;
  let todaysPickups = { c: 0 }, todaysReturns = { c: 0 }, overdueReturns = { c: 0 }, activeRentals = { c: 0 };
  let newEnquiries = { c: 0 }, pendingPayments = { t: 0 }, pendingDeposits = { t: 0 }, pendingRefunds = { c: 0 };
  let revenue = { t: 0 }, openTickets = { c: 0 };
  let revenueThisMonth = { t: 0 }, revenueLastMonth = { t: 0 };
  let revenueTrend: { pct: number; positive: boolean } | undefined;
  let monthlyBookings: Array<{ label: string; value: number }> = [];
  let enquirySources: Array<{ source: string; c: number }> = [];
  let recentEnquiries: Array<Record<string, unknown>> = [];
  let upcomingBookings: Array<Record<string, unknown>> = [];
  let attentionTickets: Array<{ ticket_no: string; category: string; description: string; created_at: string }> = [];
  let attentionRefunds: Array<{ refund_no: string; requested_amount: number; status: string; requested_at: string }> = [];
  let attentionOverdue: Array<{ id: number; booking_no: string; vehicle_name: string | null; return_at: string }> = [];
  let pendingBookings: any[] = [];
  let pendingDocs: any[] = [];
  let pendingAfterHours: any[] = [];
  let pendingRefundsData: any[] = [];

  try {
    const db = getDb();
    const g = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) ?? {};
    const a = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) ?? [];

    totalFleetUnits = Number((g("SELECT COALESCE(SUM(total_units), 0) AS c FROM vehicles WHERE active = 1") as any)?.c ?? 33);
    maintUnits = Number((g("SELECT COALESCE(SUM(total_units), 0) AS c FROM vehicles WHERE active = 1 AND status = 'maintenance'") as any)?.c ?? 0);
    bookedUnits = Number((g("SELECT COUNT(*) AS c FROM bookings WHERE status IN ('Confirmed', 'Ready for pickup', 'Vehicle handed over', 'Active rental', 'Return pending') AND datetime(return_at) >= datetime('now')") as any)?.c ?? 0);
    availableFleetUnits = Math.max(0, totalFleetUnits - bookedUnits - maintUnits);

    todaysPickups = g("SELECT COUNT(*) AS c FROM bookings WHERE date(pickup_at) = date('now') AND status NOT IN ('Cancelled', 'Rejected')") as { c: number };
    todaysReturns = g("SELECT COUNT(*) AS c FROM bookings WHERE date(return_at) = date('now') AND status IN ('Active rental', 'Vehicle handed over')") as { c: number };
    overdueReturns = g("SELECT COUNT(*) AS c FROM bookings WHERE status IN ('Vehicle handed over','Active rental') AND return_at < datetime('now')") as { c: number };
    activeRentals = { c: bookedUnits };

    newEnquiries = g("SELECT COUNT(*) AS c FROM enquiries WHERE date(created_at) = date('now')") as { c: number };
    pendingPayments = g("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'Pending'") as { t: number };
    pendingDeposits = g("SELECT COALESCE(SUM(deposit_amount),0) AS t FROM bookings WHERE status IN ('Vehicle handed over','Active rental','Return pending')") as { t: number };
    pendingRefunds = g("SELECT COUNT(*) AS c FROM refunds WHERE status IN ('Requested','Under review')") as { c: number };
    revenue = g("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'Paid'") as { t: number };
    openTickets = g("SELECT COUNT(*) AS c FROM problem_tickets WHERE status = 'Open'") as { c: number };

    revenueThisMonth = g("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'Paid' AND date(paid_at) >= date('now','start of month')") as { t: number };
    revenueLastMonth = g("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'Paid' AND date(paid_at) >= date('now','start of month','-1 month') AND date(paid_at) < date('now','start of month')") as { t: number };
    revenueTrend =
      (revenueLastMonth.t ?? 0) > 0
        ? { pct: Math.round((((revenueThisMonth.t ?? 0) - (revenueLastMonth.t ?? 0)) / (revenueLastMonth.t ?? 1)) * 100), positive: (revenueThisMonth.t ?? 0) >= (revenueLastMonth.t ?? 0) }
        : (revenueThisMonth.t ?? 0) > 0
          ? { pct: 100, positive: true }
          : undefined;

    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[d.getMonth()]}`;
      const row = g("SELECT COUNT(*) AS c FROM bookings WHERE strftime('%Y-%m', created_at) = ?", monthStr) as { c: number } | undefined;
      monthlyBookings.push({ label, value: (row as any)?.c ?? 0 });
    }

    enquirySources = a("SELECT COALESCE(source, 'Unknown') AS source, COUNT(*) AS c FROM enquiries GROUP BY source ORDER BY c DESC LIMIT 6") as Array<{ source: string; c: number }>;
    recentEnquiries = a("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 8") as Array<Record<string, unknown>>;

    upcomingBookings = a(
      `SELECT b.*, v.name AS vehicle_name, c.name AS customer_name FROM bookings b
       LEFT JOIN vehicles v ON v.id = b.vehicle_id LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.status NOT IN ('Completed','Cancelled', 'Rejected') ORDER BY b.pickup_at LIMIT 6`
    ) as Array<Record<string, unknown>>;

    attentionTickets = a("SELECT ticket_no, category, description, created_at FROM problem_tickets WHERE status = 'Open' ORDER BY created_at DESC LIMIT 5") as typeof attentionTickets;
    attentionRefunds = a("SELECT refund_no, requested_amount, status, requested_at FROM refunds WHERE status IN ('Requested','Under review') ORDER BY requested_at DESC LIMIT 5") as typeof attentionRefunds;
    attentionOverdue = a(
      `SELECT b.id, b.booking_no, v.name AS vehicle_name, b.return_at FROM bookings b LEFT JOIN vehicles v ON v.id = b.vehicle_id
       WHERE b.status IN ('Vehicle handed over','Active rental') AND b.return_at < datetime('now') ORDER BY b.return_at LIMIT 5`
    ) as typeof attentionOverdue;

    const rawPendingBookings = a(
      `SELECT b.*, v.name AS vehicle_name, v.registration_no, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM bookings b LEFT JOIN vehicles v ON v.id = b.vehicle_id LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.status IN ('Pending verification', 'Payment received', 'Enquiry', 'Draft') ORDER BY b.created_at DESC`
    ) as Array<Record<string, unknown>>;

    const pbIds = rawPendingBookings.map((r) => Number(r.id)).filter(Boolean);
    let pbDocs: any[] = [];
    if (pbIds.length > 0) {
      try {
        const ph = pbIds.map(() => "?").join(",");
        pbDocs = a(`SELECT * FROM customer_documents WHERE booking_id IN (${ph})`, ...pbIds);
      } catch {}
    }
    const docsMap = new Map<number, any[]>();
    for (const d of pbDocs) {
      const bId = Number(d.booking_id);
      if (!docsMap.has(bId)) docsMap.set(bId, []);
      docsMap.get(bId)!.push(d);
    }

    pendingBookings = rawPendingBookings.map((r) => ({
      ...r,
      documents: docsMap.get(Number(r.id)) ?? [],
    }));

    pendingDocs = (a(
      `SELECT d.*, c.name AS customer_name, b.booking_no
       FROM customer_documents d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN bookings b ON b.id = d.booking_id
       WHERE d.verified = 0 ORDER BY d.created_at DESC`
    ) as Array<Record<string, unknown>>).map((r) => ({ ...r }));

    pendingAfterHours = (a(
      `SELECT b.*, v.name AS vehicle_name, c.name AS customer_name, c.phone AS customer_phone
       FROM bookings b LEFT JOIN vehicles v ON v.id = b.vehicle_id LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.after_hours = 1 AND b.after_hours_approved_by IS NULL ORDER BY b.created_at DESC`
    ) as Array<Record<string, unknown>>).map((r) => ({ ...r }));

    pendingRefundsData = (a(
      `SELECT r.*, c.name AS customer_name, b.booking_no
       FROM refunds r LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE r.status IN ('Requested', 'Under review') ORDER BY r.requested_at DESC`
    ) as Array<Record<string, unknown>>).map((r) => ({ ...r }));
  } catch (err: any) {
    console.error("Dashboard data load error:", err?.message || err);
  }

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
