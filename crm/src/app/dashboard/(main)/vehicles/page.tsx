import type { Metadata } from "next";
import Link from "next/link";
import { getVehicles, getVehicleCategories, getBranches } from "@/lib/data";
import { formatINR } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";

export const metadata: Metadata = { title: "Vehicles Management", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function VehiclesAdminPage() {
  // Only what this page renders. The bookings and vehicle_units queries moved out with
  // the Gantt and the blocking manager, so this page no longer pays for them.
  const [vehiclesResult, categories, branches] = await Promise.all([
    getVehicles({}, true).catch((err) => {
      console.error("[VehiclesAdminPage] getVehicles error:", err);
      return [] as Awaited<ReturnType<typeof getVehicles>>;
    }),
    getVehicleCategories(false).catch((err) => {
      console.error("[VehiclesAdminPage] getVehicleCategories error:", err);
      return [] as Awaited<ReturnType<typeof getVehicleCategories>>;
    }),
    getBranches(false).catch((err) => {
      console.error("[VehiclesAdminPage] getBranches error:", err);
      return [] as Awaited<ReturnType<typeof getBranches>>;
    }),
  ]);

  const vehicles = vehiclesResult.filter((v) => v.active === 1 && v.status !== "archived");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Fleet & Vehicle Management</h1>
          <p className="text-xs text-ink-500">
            Real-time fleet inventory tracking, license plate blocking, vehicle status, and pricing controls
          </p>
        </div>
      </div>

      {/* The Gantt timeline and the plate blocking manager used to be rendered here as
          well as on their own routes, so the same controls existed in two places and
          staff had to scroll through this page to reach them. They now live only in the
          sidebar; these are signposts to them. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/dashboard/fleet/timeline" className="card flex items-center gap-3 p-4 shadow-sm border border-ink-200 transition hover:border-brand-300 hover:bg-brand-50/40">
          <span className="text-xl">📅</span>
          <span>
            <span className="block text-sm font-semibold text-ink-900">Fleet Timeline</span>
            <span className="block text-[11px] text-ink-500">Bookings and blocks across the calendar</span>
          </span>
        </Link>
        <Link href="/dashboard/fleet/blocking" className="card flex items-center gap-3 p-4 shadow-sm border border-ink-200 transition hover:border-brand-300 hover:bg-brand-50/40">
          <span className="text-xl">🛡️</span>
          <span>
            <span className="block text-sm font-semibold text-ink-900">Plate Blocking</span>
            <span className="block text-[11px] text-ink-500">Fleet availability &amp; multi-select plate blocking</span>
          </span>
        </Link>
        <Link href="/dashboard/fleet/units" className="card flex items-center gap-3 p-4 shadow-sm border border-ink-200 transition hover:border-brand-300 hover:bg-brand-50/40">
          <span className="text-xl">🚗</span>
          <span>
            <span className="block text-sm font-semibold text-ink-900">Fleet Units</span>
            <span className="block text-[11px] text-ink-500">Every plate, branch and status</span>
          </span>
        </Link>
      </div>

      {/* The fleet roster. The Gantt used to double as this page's vehicle list, so
          moving it to its own route would otherwise have left Vehicles with nothing but
          an empty add-form. */}
      <div className="space-y-2">
        <h2 className="font-display text-base font-semibold text-ink-900">
          Fleet roster <span className="text-xs font-normal text-ink-500">({vehicles.length} vehicles)</span>
        </h2>
        {vehicles.length === 0 ? (
          <EmptyState title="No vehicles yet" body="Add your first vehicle using the form below." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Rate / 24h</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/vehicles/${v.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                        {v.name}
                      </Link>
                      <span className="block text-[11px] text-ink-500">{v.registration_no ?? "no primary plate"}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{v.category_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={v.available_units === 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                        {v.available_units}/{v.total_units}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{formatINR(v.rate_24h)}</td>
                    <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/vehicles/${v.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add New Vehicle Form */}
      <div className="card p-6 shadow-sm border border-ink-200">
        <h2 className="font-display text-lg font-semibold text-ink-900 border-b border-ink-100 pb-3">
          Add New Vehicle to Fleet
        </h2>
        <div className="mt-4">
          <VehicleForm categories={categories} branches={branches} />
        </div>
      </div>
    </div>
  );
}
