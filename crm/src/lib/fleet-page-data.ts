import { getVehicles, getBranches, getVehicleUnits } from "./data";
import { sbSelect } from "./supabase-rest";

/**
 * Shared loader for the /dashboard/fleet/* pages.
 *
 * The four fleet pages need overlapping slices of the same data. Copying the load block
 * into each page would mean four places to keep in step every time a filter changes —
 * which is how the vehicles page and the booking flow drifted apart in the first place.
 * Each page calls the one loader it needs and nothing else.
 *
 * Every fetch degrades to an empty result rather than throwing: a fleet page that cannot
 * reach one table should still render the rest instead of 500ing the whole dashboard.
 * Failures are logged, never silently swallowed into fake data.
 */

export type FleetBooking = {
  id: number;
  bookingNo: string;
  customerName: string;
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  status: string;
};

/** Active, non-archived vehicles — the set every fleet screen operates on. */
export async function loadFleetVehicles() {
  const all = await getVehicles({}, true).catch((err) => {
    console.error("[fleet] getVehicles failed:", err);
    return [] as Awaited<ReturnType<typeof getVehicles>>;
  });
  return all.filter((v) => v.active === 1 && v.status !== "archived");
}

export async function loadFleetBranches() {
  return getBranches(false).catch((err) => {
    console.error("[fleet] getBranches failed:", err);
    return [] as Awaited<ReturnType<typeof getBranches>>;
  });
}

export async function loadFleetUnits() {
  return getVehicleUnits().catch((err) => {
    console.error("[fleet] getVehicleUnits failed:", err);
    return [] as Awaited<ReturnType<typeof getVehicleUnits>>;
  });
}

/** Bookings that occupy fleet capacity. Draft, Cancelled and Rejected hold nothing —
 * a rejected booking never took the vehicle out, so it has no business appearing on
 * the timeline as if it did; the vehicle should just look free for those dates. */
export async function loadFleetBookings(): Promise<FleetBooking[]> {
  const res = await sbSelect<Record<string, unknown>>(
    "bookings",
    `select=id,booking_no,vehicle_id,pickup_at,return_at,status,customers(name)&status=not.${encodeURIComponent(
      'in.("Cancelled","Draft","Rejected")'
    )}`
  );
  if (!res.ok) {
    console.error("[fleet] bookings query failed:", res.error);
    return [];
  }
  return res.data.map((r) => ({
    id: Number(r.id),
    bookingNo: String(r.booking_no),
    customerName: String((r.customers as { name?: string } | null)?.name ?? "Guest"),
    vehicleId: Number(r.vehicle_id),
    pickupAt: String(r.pickup_at),
    returnAt: String(r.return_at),
    status: String(r.status),
  }));
}

export type FleetBlock = {
  id: number;
  vehicleId: number;
  vehicleUnitId: number | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  notes: string | null;
};

/**
 * Staff-created blocks that are still in effect (booking_id is null, so a real
 * reservation's own linked block is excluded — that occupancy already arrives through
 * loadFleetBookings via the `bookings` table, and folding it in again here would count
 * the same hold twice).
 */
export async function loadFleetBlocks(): Promise<FleetBlock[]> {
  const res = await sbSelect<Record<string, unknown>>(
    "availability_blocks",
    `select=id,vehicle_id,vehicle_unit_id,starts_at,ends_at,reason,notes&booking_id=is.null&ends_at=gte.${encodeURIComponent(
      new Date().toISOString()
    )}`
  );
  if (!res.ok) {
    console.error("[fleet] availability_blocks query failed:", res.error);
    return [];
  }
  return res.data.map((r) => ({
    id: Number(r.id),
    vehicleId: Number(r.vehicle_id),
    vehicleUnitId: r.vehicle_unit_id == null ? null : Number(r.vehicle_unit_id),
    startsAt: String(r.starts_at),
    endsAt: String(r.ends_at),
    reason: String(r.reason),
    notes: r.notes == null ? null : String(r.notes),
  }));
}

/** Shape FleetGanttCalendar expects. */
export function toGanttVehicles(vehicles: Awaited<ReturnType<typeof loadFleetVehicles>>) {
  return vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category_name ?? "General",
    totalUnits: v.total_units ?? 1,
    availableUnits: v.available_units ?? v.total_units ?? 1,
    status: v.status,
    rate24h: v.rate_24h,
  }));
}
