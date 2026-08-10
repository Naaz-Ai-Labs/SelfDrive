import type { Metadata } from "next";
import Link from "next/link";
import { getVehicles, getVehicleCategories, getBranches } from "@/lib/data";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";
import { FleetGanttCalendar } from "@/components/dashboard/FleetGanttCalendar";

export const metadata: Metadata = { title: "Vehicles Management", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function VehiclesAdminPage() {
  let vehicles: ReturnType<typeof getVehicles> = [];
  let categories: ReturnType<typeof getVehicleCategories> = [];
  let branches: ReturnType<typeof getBranches> = [];
  let rawBookings: Array<{
    id: number;
    bookingNo: string;
    customerName: string;
    vehicleId: number;
    pickupAt: string;
    returnAt: string;
    status: string;
  }> = [];

  try {
    vehicles = getVehicles({}, false);
    categories = getVehicleCategories(false);
    branches = getBranches(false);

    const db = getDb();
    const rows = (
      db
        .prepare(
          `SELECT b.id, b.booking_no, b.vehicle_id, b.pickup_at, b.return_at, b.status, c.name AS customer_name
           FROM bookings b
           LEFT JOIN customers c ON c.id = b.customer_id
           WHERE b.status NOT IN ('Cancelled', 'Draft')`
        )
        .all() as Array<Record<string, unknown>>
    );

    rawBookings = rows.map((r) => ({
      id: Number(r.id),
      bookingNo: String(r.booking_no),
      customerName: String(r.customer_name ?? "Guest"),
      vehicleId: Number(r.vehicle_id),
      pickupAt: String(r.pickup_at),
      returnAt: String(r.return_at),
      status: String(r.status),
    }));
  } catch (err: any) {
    console.error("VehiclesAdminPage data load error:", err?.message || err);
  }

  const ganttVehicles = vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category_name ?? "General",
    totalUnits: v.total_units ?? 1,
    availableUnits: v.available_units ?? v.total_units ?? 1,
    status: v.status,
    rate24h: v.rate_24h,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Fleet & Vehicle Management</h1>
          <p className="text-xs text-ink-500">
            Real-time fleet inventory units tracking, vehicle status, and pricing controls
          </p>
        </div>
      </div>

      {/* Interactive Fleet Gantt Timeline Schedule */}
      <FleetGanttCalendar vehicles={ganttVehicles} bookings={rawBookings} />

      {/* Vehicle Roster Table */}
      <div className="card overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="px-4 py-3 font-semibold">Vehicle</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Fleet Inventory</th>
              <th className="px-4 py-3 font-semibold">24h Rate</th>
              <th className="px-4 py-3 font-semibold">Deposit</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-ink-50 hover:bg-ink-50/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {v.photos && v.photos.length > 0 ? (
                      <img src={v.photos[0]} alt={v.name} className="h-10 w-14 rounded-lg object-cover border border-ink-200" />
                    ) : (
                      <div className="h-10 w-14 rounded-lg bg-ink-100 flex items-center justify-center text-xs text-ink-400">
                        🚗
                      </div>
                    )}
                    <div>
                      <Link href={`/dashboard/vehicles/${v.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                        {v.name}
                      </Link>
                      <p className="text-xs text-ink-400">{v.registration_no ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-600">{v.category_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-ink-900 bg-ink-100 px-2 py-0.5 rounded text-xs">
                    📦 {v.total_units ?? 1} Units
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-ink-800">{formatINR(v.rate_24h)}</td>
                <td className="px-4 py-3 text-ink-600">{formatINR(v.deposit)}</td>
                <td className="px-4 py-3">
                  {v.status === "maintenance" ? (
                    <span className="badge bg-amber-100 text-amber-800 font-semibold">Maintenance</span>
                  ) : v.status === "archived" ? (
                    <span className="badge bg-stone-100 text-stone-600 font-semibold">Archived</span>
                  ) : (v.available_units ?? v.total_units ?? 1) > 0 ? (
                    <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
                      {v.available_units ?? v.total_units ?? 1}/{v.total_units ?? 1} Available
                    </span>
                  ) : (
                    <span className="badge bg-red-100 text-red-800 font-semibold">
                      0/{v.total_units ?? 1} Booked
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/dashboard/vehicles/${v.id}`} className="btn-secondary px-3 py-1 text-xs">
                    Edit / Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vehicles.length === 0 && <EmptyState title="No vehicles found" body="Add your first vehicle using the form below." />}
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
