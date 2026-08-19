import type { Metadata } from "next";
import Link from "next/link";
import { getVehicles, getVehicleCategories, getBranches, getCategoryPresetPhoto, getVehicleUnits } from "@/lib/data";
import { sbSelect } from "@/lib/supabase-rest";
import { formatINR } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/dashboard/VehicleForm";
import { FleetGanttCalendar } from "@/components/dashboard/FleetGanttCalendar";
import { FleetUnitBlockManager } from "@/components/dashboard/FleetUnitBlockManager";

export const metadata: Metadata = { title: "Vehicles Management", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function VehiclesAdminPage() {
  let vehicles: Awaited<ReturnType<typeof getVehicles>> = [];
  let categories: Awaited<ReturnType<typeof getVehicleCategories>> = [];
  let branches: Awaited<ReturnType<typeof getBranches>> = [];
  let units: Awaited<ReturnType<typeof getVehicleUnits>> = [];
  let rawBookings: Array<{
    id: number;
    bookingNo: string;
    customerName: string;
    vehicleId: number;
    pickupAt: string;
    returnAt: string;
    status: string;
  }> = [];

  const [vehiclesResult, categoriesResult, branchesResult, bookingsResult, unitsResult] = await Promise.all([
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
    sbSelect<Record<string, unknown>>(
      "bookings",
      `select=id,booking_no,vehicle_id,pickup_at,return_at,status,customers(name)&status=not.${encodeURIComponent('in.("Cancelled","Draft")')}`
    ),
    getVehicleUnits().catch((err) => {
      console.error("[VehiclesAdminPage] getVehicleUnits error:", err);
      return [] as Awaited<ReturnType<typeof getVehicleUnits>>;
    }),
  ]);

  vehicles = vehiclesResult.filter((v) => v.active === 1 && v.status !== "archived");
  categories = categoriesResult;
  branches = branchesResult;
  units = unitsResult;

  const bookingsList = bookingsResult.ok ? bookingsResult.data : [];

  rawBookings = bookingsList.map((r) => ({
    id: Number(r.id),
    bookingNo: String(r.booking_no),
    customerName: String((r.customers as { name?: string } | null)?.name ?? "Guest"),
    vehicleId: Number(r.vehicle_id),
    pickupAt: String(r.pickup_at),
    returnAt: String(r.return_at),
    status: String(r.status),
  }));

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
            Real-time fleet inventory tracking, license plate blocking, vehicle status, and pricing controls
          </p>
        </div>
      </div>

      {/* Interactive Fleet Gantt Timeline Schedule */}
      <FleetGanttCalendar vehicles={ganttVehicles} bookings={rawBookings} />

      {/* Fast Multi-Select Physical Units & License Numbers Blocking Manager */}
      <div className="space-y-2">
        <h2 className="font-display text-base font-semibold text-ink-900 flex items-center gap-2">
          <span>🛡️ Fleet Availability & Multi-Select License Plate Blocking</span>
        </h2>
        <FleetUnitBlockManager vehicles={vehicles} units={units} branches={branches} />
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
