import type { Metadata } from "next";
import { FleetUnitBlockManager } from "@/components/dashboard/FleetUnitBlockManager";
import { loadFleetVehicles, loadFleetBranches, loadFleetUnits } from "@/lib/fleet-page-data";

export const metadata: Metadata = { title: "Plate Blocking", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function FleetBlockingPage() {
  const [vehicles, branches, units] = await Promise.all([
    loadFleetVehicles(),
    loadFleetBranches(),
    loadFleetUnits(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Plate Blocking</h1>
          <p className="text-xs text-ink-500">
            Select one or more registration plates and take them off the road, or release them back.
          </p>
        </div>
      </div>

      <FleetUnitBlockManager vehicles={vehicles} units={units} branches={branches} />
    </div>
  );
}
