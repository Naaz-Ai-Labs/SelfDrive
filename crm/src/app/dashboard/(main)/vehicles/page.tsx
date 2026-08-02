import type { Metadata } from "next";
import Link from "next/link";
import { getVehicles, getVehicleCategories, getBranches } from "@/lib/data";
import { formatINR } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";

export const metadata: Metadata = { title: "Vehicles", robots: { index: false, follow: false } };
export const revalidate = 0;

export default function VehiclesAdminPage() {
  const vehicles = getVehicles({}, false);
  const categories = getVehicleCategories(false);
  const branches = getBranches(false);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Vehicles</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="px-4 py-3 font-semibold">Vehicle</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">24h rate</th>
              <th className="px-4 py-3 font-semibold">Deposit</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-ink-50 hover:bg-ink-50/40">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/vehicles/${v.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{v.name}</Link>
                  <p className="text-xs text-ink-400">{v.registration_no ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-ink-600">{v.category_name ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-ink-800">{formatINR(v.rate_24h)}</td>
                <td className="px-4 py-3 text-ink-600">{formatINR(v.deposit)}</td>
                <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {vehicles.length === 0 && <EmptyState title="No vehicles" body="Add your first vehicle using the form below." />}
      </div>

      <div className="card p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Add a vehicle</h2>
        <div className="mt-4">
          <VehicleForm categories={categories} branches={branches} />
        </div>
      </div>
    </div>
  );
}
