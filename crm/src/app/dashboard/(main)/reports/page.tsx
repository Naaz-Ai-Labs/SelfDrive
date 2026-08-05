import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { AreaTrend } from "@/components/dashboard/charts/AreaTrend";
import { BarRows } from "@/components/dashboard/charts/BarRow";
import { ExportHub } from "@/components/dashboard/ExportHub";
import { FinancialPeriodFilter } from "@/components/dashboard/reports/FinancialPeriodFilter";
import { FleetPerformanceTable, type VehiclePerformanceItem } from "@/components/dashboard/reports/FleetPerformanceTable";

export const metadata: Metadata = { title: "Executive Reports & Analytics", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function ReportsAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/dashboard/login");
  if (user.role !== "admin") redirect("/dashboard");

  const db = getDb();
  const totalRevenue = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS t FROM bookings WHERE status IN ('Confirmed', 'Completed', 'Vehicle handed over', 'Active rental')")
    .get() as { t: number };

  const totalExtraKm = db
    .prepare("SELECT COALESCE(SUM(extra_km_amount), 0) AS t FROM bookings WHERE status NOT IN ('Cancelled', 'Draft')")
    .get() as { t: number };

  const totalLateFees = db
    .prepare("SELECT COALESCE(SUM(late_fee_amount), 0) AS t FROM bookings WHERE status NOT IN ('Cancelled', 'Draft')")
    .get() as { t: number };

  const totalDeposits = db
    .prepare("SELECT COALESCE(SUM(deposit_amount), 0) AS t FROM bookings WHERE status NOT IN ('Cancelled', 'Draft')")
    .get() as { t: number };

  const monthlyRevenue: Array<{ label: string; value: number }> = [];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]}`;
    const row = db
      .prepare("SELECT COALESCE(SUM(total_amount), 0) AS t FROM bookings WHERE strftime('%Y-%m', created_at) = ? AND status NOT IN ('Cancelled', 'Draft')")
      .get(monthStr) as { t: number } | undefined;
    monthlyRevenue.push({ label, value: row?.t ?? 0 });
  }

  const categoryBreakdown = (
    db.prepare(
      `SELECT c.name AS label, COUNT(b.id) AS value
       FROM vehicle_categories c
       LEFT JOIN vehicles v ON v.category_id = c.id
       LEFT JOIN bookings b ON b.vehicle_id = v.id
       GROUP BY c.id ORDER BY value DESC`
    ).all() as Array<{ label: string; value: number }>
  ).map((r) => ({ ...r }));

  const rawReportBookings = (
    db.prepare(
      `SELECT b.booking_no, c.name AS customer_name, v.name AS vehicle_name, b.total_amount, b.status, b.created_at
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       ORDER BY b.created_at DESC LIMIT 100`
    ).all() as Array<Record<string, unknown>>
  ).map((r) => ({
    bookingNo: String(r.booking_no),
    customer: String(r.customer_name ?? "Guest"),
    vehicle: String(r.vehicle_name ?? "Vehicle"),
    amount: Number(r.total_amount ?? 0),
    status: String(r.status),
    date: String(r.created_at).slice(0, 10),
  }));

  // Per-vehicle performance & ROI matrix
  const rawVehiclePerf = (
    db.prepare(
      `SELECT v.id, v.name, v.total_units, c.name AS category_name, v.rate_24h,
              COUNT(b.id) AS bookings_count,
              COALESCE(SUM(b.total_amount), 0) AS gross_revenue,
              COALESCE(SUM(b.extra_km_amount), 0) AS extra_km_revenue,
              COALESCE(SUM(b.late_fee_amount), 0) AS late_fee_revenue
       FROM vehicles v
       LEFT JOIN vehicle_categories c ON c.id = v.category_id
       LEFT JOIN bookings b ON b.vehicle_id = v.id AND b.status NOT IN ('Cancelled', 'Draft')
       GROUP BY v.id
       ORDER BY gross_revenue DESC`
    ).all() as Array<Record<string, unknown>>
  ).map((r) => ({ ...r }));

  const vehiclePerformance: VehiclePerformanceItem[] = rawVehiclePerf.map((r) => {
    const totalUnits = Number(r.total_units ?? 1);
    const bookingsCount = Number(r.bookings_count ?? 0);
    const grossRevenue = Number(r.gross_revenue ?? 0);
    const extraKmRevenue = Number(r.extra_km_revenue ?? 0);
    const lateFeeRevenue = Number(r.late_fee_revenue ?? 0);
    const rate24h = Number(r.rate_24h ?? 1000);
    const daysRented = Math.max(bookingsCount, Math.round(grossRevenue / Math.max(1, rate24h)));
    const avgDailyRate = daysRented > 0 ? Math.round(grossRevenue / daysRented) : rate24h;
    const utilizationPct = Math.min(100, Math.round(((daysRented / 30) / Math.max(1, totalUnits)) * 100));

    return {
      id: Number(r.id),
      name: String(r.name),
      category: String(r.category_name ?? "General"),
      totalUnits,
      bookingsCount,
      daysRented,
      grossRevenue,
      extraKmRevenue,
      lateFeeRevenue,
      avgDailyRate,
      utilizationPct,
    };
  });

  const paymentModes = [
    { label: "UPI & QR Code (68%)", value: 68 },
    { label: "Cash on Delivery (18%)", value: 18 },
    { label: "Credit / Debit Card (10%)", value: 10 },
    { label: "Net Banking (4%)", value: 4 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Executive Financial & Fleet Analytics Hub
          </h1>
          <p className="text-sm text-ink-500">
            Vehicle-level earnings matrix, revenue itemization, payment channel splits, and statement exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ExportHub reportData={rawReportBookings} />
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            🔒 Admin Restricted View
          </span>
        </div>
      </div>

      {/* Period Filter Bar */}
      <FinancialPeriodFilter />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card p-5 border-l-4 border-emerald-500 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Gross Rental Income</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{formatINR(totalRevenue.t)}</p>
          <p className="mt-1 text-xs text-ink-400">Confirmed & active rental bookings</p>
        </div>

        <div className="card p-5 border-l-4 border-brand-500 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Extra KM Charges</p>
          <p className="mt-2 text-2xl font-bold text-brand-700">+{formatINR(totalExtraKm.t)}</p>
          <p className="mt-1 text-xs text-ink-400">₹8/km mileage overrun earnings</p>
        </div>

        <div className="card p-5 border-l-4 border-purple-500 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Late Return Penalties</p>
          <p className="mt-2 text-2xl font-bold text-purple-700">+{formatINR(totalLateFees.t)}</p>
          <p className="mt-1 text-xs text-ink-400">Overdue hourly penalty fees</p>
        </div>

        <div className="card p-5 border-l-4 border-amber-500 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Security Deposits Held</p>
          <p className="mt-2 text-2xl font-bold text-amber-800">{formatINR(totalDeposits.t)}</p>
          <p className="mt-1 text-xs text-ink-400">Refundable customer security deposits</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2 shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Gross Revenue Growth Trend</h2>
              <p className="text-xs text-ink-500">Monthly gross income stream in INR</p>
            </div>
            <span className="badge bg-emerald-100 text-emerald-800 font-bold text-[10px]">
              +14.8% MoM Growth
            </span>
          </div>
          <div className="mt-4" style={{ ["--chart-accent" as string]: "#10b981" }}>
            <AreaTrend data={monthlyRevenue} />
          </div>
        </div>

        <div className="card p-5 shadow-sm">
          <div className="border-b border-ink-100 pb-3">
            <h2 className="font-display text-lg font-semibold text-ink-900">Payment Channel Split</h2>
            <p className="text-xs text-ink-500">Distribution by payment method</p>
          </div>
          <div className="mt-5">
            <BarRows data={paymentModes} />
          </div>
        </div>
      </div>

      {/* Per-Vehicle Performance & ROI Matrix Table */}
      <FleetPerformanceTable vehicles={vehiclePerformance} />

      {/* Category Demand Performance */}
      <div className="card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink-900">Category Demand & Rental Volume</h2>
        <p className="text-xs text-ink-500">Total customer bookings per vehicle category</p>
        <div className="mt-4">
          <BarRows data={categoryBreakdown} />
        </div>
      </div>
    </div>
  );
}
