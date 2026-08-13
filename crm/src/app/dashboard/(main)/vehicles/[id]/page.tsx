import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVehicleById, getVehicleCategories, getBranches } from "@/lib/data";
import { sbSelect, num } from "@/lib/supabase-rest";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";
import { PricingRuleForm } from "@/components/dashboard/PricingRuleForm";

export const metadata: Metadata = { title: "Vehicle detail", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function VehicleAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  type PricingRule = { id: number; name: string; day_type: string; start_date: string; end_date: string; rate_24h: number | null; deposit: number | null; priority: number };

  const vehicle = await getVehicleById(paramId);
  if (!vehicle) notFound();

  const [categories, branches, rulesResult, bookingsResult] = await Promise.all([
    getVehicleCategories(false),
    getBranches(false),
    sbSelect<Record<string, unknown>>("pricing_rules", `select=*&vehicle_id=eq.${vehicle.id}&order=priority.desc`),
    sbSelect<Record<string, unknown>>(
      "bookings",
      `select=*,customers(name)&vehicle_id=eq.${vehicle.id}&order=pickup_at.desc&limit=10`
    ),
  ]);

  if (!rulesResult.ok) throw new Error(`Could not load pricing rules: ${rulesResult.error}`);
  if (!bookingsResult.ok) throw new Error(`Could not load bookings: ${bookingsResult.error}`);

  // NUMERIC arrives as a string over PostgREST; the rule form does arithmetic on these.
  const rules: PricingRule[] = rulesResult.data.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    day_type: String(r.day_type),
    start_date: String(r.start_date),
    end_date: String(r.end_date),
    rate_24h: r.rate_24h === null || r.rate_24h === undefined ? null : num(r.rate_24h),
    deposit: r.deposit === null || r.deposit === undefined ? null : num(r.deposit),
    priority: num(r.priority),
  }));

  const bookings = bookingsResult.data.map((b): Record<string, unknown> => ({
    ...b,
    customer_name: (b.customers as { name?: string } | null)?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/vehicles" className="text-sm text-brand-700 hover:underline">← All vehicles</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-900">{vehicle.name}</h1>
          <StatusBadge status={vehicle.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold text-ink-900">Edit vehicle</h2>
          <div className="mt-4"><VehicleForm categories={categories} branches={branches} vehicle={vehicle} /></div>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Pricing rules</h2>
            <p className="mt-1 text-xs text-ink-500">Overrides for weekends, long weekends, festivals and peak season.</p>
            <div className="mt-4"><PricingRuleForm vehicleId={vehicle.id} rules={rules} /></div>
          </div>
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Recent bookings</h2>
            <div className="mt-3 space-y-2 text-sm">
              {bookings.length === 0 && <p className="text-ink-400">No bookings yet.</p>}
              {bookings.map((b) => (
                <Link key={Number(b.id)} href={`/dashboard/bookings/${Number(b.id)}`} className="block rounded-lg border border-ink-100 p-3 hover:border-brand-500">
                  <p className="font-medium text-ink-800">{String(b.booking_no)} — {String(b.customer_name ?? "—")}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(String(b.pickup_at))}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
