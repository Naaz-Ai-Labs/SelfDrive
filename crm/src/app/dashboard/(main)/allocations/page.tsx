import type { Metadata } from "next";
import {
  getDailyBranchAllocations,
  getBranches,
  getVehicles,
  getVehicleUnits,
  getGlobalFleetSummary,
} from "@/lib/data";
import { DailyAllocationMatrix } from "@/components/dashboard/DailyAllocationMatrix";

export const metadata: Metadata = {
  title: "Fleet Branch Allocations",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function AllocationsPage() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 13); // 14-day schedule
  const endDateStr = endDate.toISOString().split("T")[0];

  const [allocations, branches, vehicles, units, summary] = await Promise.all([
    getDailyBranchAllocations(todayStr, endDateStr),
    getBranches(true),
    getVehicles({}, true),
    getVehicleUnits(),
    getGlobalFleetSummary(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Daily Branch Allocations & Fleet Transfer
          </h1>
          <p className="text-xs text-ink-500">
            Dynamic distribution of physical units across branches (Sakleshpur, Hassan & all branches) with period-based transfer management
          </p>
        </div>
      </div>

      <DailyAllocationMatrix
        initialAllocations={allocations}
        branches={branches}
        vehicles={vehicles}
        units={units}
        summary={summary}
      />
    </div>
  );
}
