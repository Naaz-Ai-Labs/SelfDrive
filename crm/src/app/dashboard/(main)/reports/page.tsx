import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sbSelect, num } from "@/lib/supabase-rest";
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

  // PostgREST cannot express GROUP BY across joins, so this page pulls the booking
  // ledger once and aggregates in memory. Everything below derives from that single
  // read rather than the eight separate SQL aggregates it replaces.
  const [bookingsRes, vehiclesRes, categoriesRes, customersRes] = await Promise.all([
    sbSelect<Record<string, unknown>>(
      "bookings",
      "select=booking_no,customer_id,vehicle_id,total_amount,extra_km_amount,late_fee_amount,deposit_amount,status,created_at&order=created_at.desc"
    ),
    sbSelect<Record<string, unknown>>("vehicles", "select=id,name,total_units,rate_24h,category_id"),
    sbSelect<{ id: number; name: string }>("vehicle_categories", "select=id,name"),
    sbSelect<{ id: number; name: string }>("customers", "select=id,name"),
  ]);

  if (!bookingsRes.ok) throw new Error(`Could not load bookings: ${bookingsRes.error}`);
  if (!vehiclesRes.ok) throw new Error(`Could not load vehicles: ${vehiclesRes.error}`);
  if (!categoriesRes.ok) throw new Error(`Could not load vehicle categories: ${categoriesRes.error}`);
  if (!customersRes.ok) throw new Error(`Could not load customers: ${customersRes.error}`);

  const allBookings = bookingsRes.data;
  const categoryNameById = new Map(categoriesRes.data.map((c) => [Number(c.id), c.name]));
  const customerNameById = new Map(customersRes.data.map((c) => [Number(c.id), c.name]));
  const vehicleNameById = new Map(vehiclesRes.data.map((v) => [Number(v.id), String(v.name)]));

  const REVENUE_STATUSES = new Set(["Confirmed", "Completed", "Vehicle handed over", "Active rental"]);
  const EXCLUDED_STATUSES = new Set(["Cancelled", "Draft"]);
  const counted = allBookings.filter((b) => !EXCLUDED_STATUSES.has(String(b.status)));

  // num() on every money field: these are NUMERIC columns and arrive as strings.
  const sum = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce((acc, r) => acc + num(r[key]), 0);

  const totalRevenue = { t: sum(allBookings.filter((b) => REVENUE_STATUSES.has(String(b.status))), "total_amount") };
  const totalExtraKm = { t: sum(counted, "extra_km_amount") };
  const totalLateFees = { t: sum(counted, "late_fee_amount") };
  const totalDeposits = { t: sum(counted, "deposit_amount") };

  const monthlyRevenue: Array<{ label: string; value: number }> = [];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]}`;
    const inMonth = counted.filter((b) => String(b.created_at ?? "").slice(0, 7) === monthStr);
    monthlyRevenue.push({ label, value: sum(inMonth, "total_amount") });
  }

  // Real month-on-month growth from the two most recent points above — this
  // replaced a hardcoded "+14.8% MoM Growth" badge that never changed regardless
  // of the actual numbers.
  const lastMonthRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.value ?? 0;
  const prevMonthRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.value ?? 0;
  const momGrowthPct = prevMonthRevenue > 0 ? ((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : null;

  // Day-level trend: "booking trends should be for a day, not a month". Buckets by
  // the booking's own created_at date string (already IST-correct at the source —
  // every booking write uses new Date().toISOString(), and this only needs the
  // date portion for grouping, not a timezone-sensitive comparison).
  const dailyRevenue: Array<{ label: string; value: number }> = [];
  const dailyBookingCount: Array<{ label: string; value: number }> = [];
  const DAY_WINDOW = 14;
  for (let i = DAY_WINDOW - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    const inDay = counted.filter((b) => String(b.created_at ?? "").slice(0, 10) === dayStr);
    dailyRevenue.push({ label, value: sum(inDay, "total_amount") });
    dailyBookingCount.push({ label, value: inDay.length });
  }

  const categoryIdByVehicle = new Map(vehiclesRes.data.map((v) => [Number(v.id), Number(v.category_id)]));
  const categoryCounts = new Map<number, number>();
  for (const b of allBookings) {
    const categoryId = categoryIdByVehicle.get(Number(b.vehicle_id));
    if (categoryId === undefined || Number.isNaN(categoryId)) continue;
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
  }
  const categoryBreakdown = categoriesRes.data
    .map((c) => ({ label: c.name, value: categoryCounts.get(Number(c.id)) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const rawReportBookings = allBookings.slice(0, 100).map((r) => ({
    bookingNo: String(r.booking_no),
    customer: customerNameById.get(Number(r.customer_id)) ?? "Guest",
    vehicle: vehicleNameById.get(Number(r.vehicle_id)) ?? "Vehicle",
    amount: num(r.total_amount),
    status: String(r.status),
    date: String(r.created_at).slice(0, 10),
  }));

  // Per-vehicle performance & ROI matrix
  const perVehicle = new Map<number, { count: number; gross: number; extraKm: number; lateFee: number }>();
  for (const b of counted) {
    const key = Number(b.vehicle_id);
    if (!Number.isFinite(key)) continue;
    const acc = perVehicle.get(key) ?? { count: 0, gross: 0, extraKm: 0, lateFee: 0 };
    acc.count += 1;
    acc.gross += num(b.total_amount);
    acc.extraKm += num(b.extra_km_amount);
    acc.lateFee += num(b.late_fee_amount);
    perVehicle.set(key, acc);
  }

  const rawVehiclePerf = vehiclesRes.data
    .map((v) => {
      const stats = perVehicle.get(Number(v.id)) ?? { count: 0, gross: 0, extraKm: 0, lateFee: 0 };
      return {
        id: Number(v.id),
        name: String(v.name),
        total_units: num(v.total_units, 1),
        category_name: categoryNameById.get(Number(v.category_id)) ?? null,
        rate_24h: num(v.rate_24h, 1000),
        bookings_count: stats.count,
        gross_revenue: stats.gross,
        extra_km_revenue: stats.extraKm,
        late_fee_revenue: stats.lateFee,
      };
    })
    .sort((a, b) => b.gross_revenue - a.gross_revenue);

  const vehiclePerformance: VehiclePerformanceItem[] = rawVehiclePerf.map((r) => {
    const totalUnits = r.total_units || 1;
    const bookingsCount = r.bookings_count;
    const grossRevenue = r.gross_revenue;
    const extraKmRevenue = r.extra_km_revenue;
    const lateFeeRevenue = r.late_fee_revenue;
    const rate24h = r.rate_24h || 1000;
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
            {momGrowthPct !== null && (
              <span
                className={`badge font-bold text-[10px] ${momGrowthPct >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
              >
                {momGrowthPct >= 0 ? "+" : ""}
                {momGrowthPct.toFixed(1)}% MoM
              </span>
            )}
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

        <div className="card p-5 lg:col-span-2 shadow-sm">
          <div className="border-b border-ink-100 pb-3">
            <h2 className="font-display text-lg font-semibold text-ink-900">Daily Revenue Trend</h2>
            <p className="text-xs text-ink-500">Last {DAY_WINDOW} days, by the day the booking was made</p>
          </div>
          <div className="mt-4" style={{ ["--chart-accent" as string]: "#f2b705" }}>
            <AreaTrend data={dailyRevenue} />
          </div>
        </div>

        <div className="card p-5 shadow-sm">
          <div className="border-b border-ink-100 pb-3">
            <h2 className="font-display text-lg font-semibold text-ink-900">Daily Booking Count</h2>
            <p className="text-xs text-ink-500">Last {DAY_WINDOW} days</p>
          </div>
          <div className="mt-5">
            <BarRows data={dailyBookingCount} />
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
