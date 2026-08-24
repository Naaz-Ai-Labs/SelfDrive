import type { Metadata } from "next";
import { FleetGanttCalendar } from "@/components/dashboard/FleetGanttCalendar";
import { loadFleetVehicles, loadFleetBookings, loadFleetBlocks, toGanttVehicles } from "@/lib/fleet-page-data";

export const metadata: Metadata = { title: "Fleet Timeline", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function FleetTimelinePage() {
  const [vehicles, bookings, blocks] = await Promise.all([
    loadFleetVehicles(),
    loadFleetBookings(),
    loadFleetBlocks(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Fleet Timeline</h1>
          <p className="text-xs text-ink-500">
            Every vehicle across the calendar, with live bookings and blocked periods.
          </p>
        </div>
      </div>

      <FleetGanttCalendar vehicles={toGanttVehicles(vehicles)} bookings={bookings} blocks={blocks} />
    </div>
  );
}
