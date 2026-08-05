import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVehicleById, getVehicleCategories, getBranches } from "@/lib/data";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";
import { PricingRuleForm } from "@/components/dashboard/PricingRuleForm";

export const metadata: Metadata = { title: "Vehicle detail", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function VehicleAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const vehicle = getVehicleById(Number(paramId));
  if (!vehicle) notFound();
  const categories = getVehicleCategories(false);
  const branches = getBranches(false);
  const db = getDb();
  const rules = (db.prepare("SELECT * FROM pricing_rules WHERE vehicle_id = ? ORDER BY priority DESC").all(vehicle.id) as Array<Record<string, unknown>>).map((r) => ({ ...r })) as unknown as Array<{ id: number; name: string; day_type: string; start_date: string; end_date: string; rate_24h: number | null; deposit: number | null; priority: number }>;
  const bookings = db
    .prepare("SELECT b.*, c.name AS customer_name FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.vehicle_id = ? ORDER BY b.pickup_at DESC LIMIT 10")
    .all(vehicle.id) as Array<Record<string, unknown>>;

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
