import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, EmptyState } from "@/components/ui";
import { loadFleetUnits, loadFleetBranches } from "@/lib/fleet-page-data";

export const metadata: Metadata = { title: "Fleet Units", robots: { index: false, follow: false } };
export const revalidate = 0;

/**
 * Every physical unit in one place.
 *
 * Previously the only way to see a registration plate was to open the owning vehicle and
 * scroll to the Physical Fleet Units block, so answering "where is KA51EE5567" meant
 * opening vehicles one at a time. This lists all units across all vehicles, grouped by
 * branch, with a direct link back to the owning vehicle for edits.
 */
export default async function FleetUnitsPage() {
  const [units, branches] = await Promise.all([loadFleetUnits(), loadFleetBranches()]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const counts = units.reduce<Record<string, number>>((acc, u) => {
    const key = u.status || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const missingPlate = units.filter((u) => !u.registration_no?.trim()).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Fleet Units</h1>
          <p className="text-xs text-ink-500">
            Every physical vehicle, its registration plate and the branch holding it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-ink-900 px-3 py-1 font-semibold text-white">
            {units.length} total
          </span>
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, n]) => (
              <span key={status} className="rounded-full border border-ink-200 px-3 py-1 text-ink-700">
                {status}: <strong>{n}</strong>
              </span>
            ))}
        </div>
      </div>

      {missingPlate > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{missingPlate}</strong> unit{missingPlate === 1 ? "" : "s"} have no registration plate recorded.
          A unit without a plate cannot be identified at handover.
        </p>
      )}

      {units.length === 0 ? (
        <EmptyState title="No fleet units" body="Add units from a vehicle's edit page." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Registration plate</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{u.unit_identifier}</td>
                  <td className="px-4 py-3 font-mono">
                    {u.registration_no?.trim() ? (
                      <span className="font-semibold text-ink-900">{u.registration_no}</span>
                    ) : (
                      <span className="text-xs italic text-amber-700">not recorded</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-800">
                    {u.vehicle_name ?? `Vehicle ${u.vehicle_id}`}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {u.current_branch_name ?? branchName.get(u.current_branch_id ?? -1) ?? "Unassigned"}
                    {u.branch_blocked && (
                      <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        BRANCH BLOCKED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/vehicles/${u.vehicle_id}`}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
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
  );
}
