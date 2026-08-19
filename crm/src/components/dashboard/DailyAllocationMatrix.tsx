"use client";

import { useState } from "react";
import type { DailyAllocationRow, Branch, VehicleUnit, Vehicle, GlobalFleetSummary } from "@/lib/data";
import { BranchTransferModal } from "./BranchTransferModal";
import { VehicleReallocateModal } from "./VehicleReallocateModal";
import { UnitEditModal } from "./UnitEditModal";

export function DailyAllocationMatrix({
  initialAllocations,
  branches,
  vehicles,
  units,
  summary,
}: {
  initialAllocations: DailyAllocationRow[];
  branches: Branch[];
  vehicles: Vehicle[];
  units: VehicleUnit[];
  summary: GlobalFleetSummary;
}) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [transferUnit, setTransferUnit] = useState<VehicleUnit | null>(null);
  const [editUnit, setEditUnit] = useState<VehicleUnit | null>(null);
  const [showReallocateModal, setShowReallocateModal] = useState(false);
  const [reallocateVehicleId, setReallocateVehicleId] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"matrix" | "units">("matrix");

  const filteredUnits = units.filter((u) => {
    if (selectedVehicleId !== "all" && u.vehicle_id !== Number(selectedVehicleId)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Fleet Metrics Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Total Fleet</span>
          <p className="mt-1 text-xl font-bold text-ink-900">{summary.totalFleet}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Operational</span>
          <p className="mt-1 text-xl font-bold text-emerald-700">{summary.operationalFleet}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider">Available</span>
          <p className="mt-1 text-xl font-bold text-sky-700">{summary.available}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Booked</span>
          <p className="mt-1 text-xl font-bold text-amber-700">{summary.booked}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">Allocated</span>
          <p className="mt-1 text-xl font-bold text-indigo-700">{summary.allocated}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Unallocated</span>
          <p className="mt-1 text-xl font-bold text-ink-700">{summary.unallocated}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider">Maintenance</span>
          <p className="mt-1 text-xl font-bold text-rose-700">{summary.maintenance}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider">Blocked</span>
          <p className="mt-1 text-xl font-bold text-purple-700">{summary.blocked}</p>
        </div>
      </div>

      {/* View Tabs & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "matrix"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-ink-100 text-ink-700 hover:bg-ink-200"
            }`}
          >
            📅 Daily Allocation Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("units")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "units"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-ink-100 text-ink-700 hover:bg-ink-200"
            }`}
          >
            🏷️ Physical Units & Transfers ({units.length})
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setReallocateVehicleId(selectedVehicleId !== "all" ? Number(selectedVehicleId) : undefined);
              setShowReallocateModal(true);
            }}
            className="btn-primary text-xs font-semibold py-1.5 px-3 flex items-center gap-1.5 shadow-xs"
          >
            ⚡ Quick Re-Allocate Fleet
          </button>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-ink-600">Filter Vehicle:</label>
            <select
              className="input py-1 text-xs font-medium w-auto"
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              <option value="all">All Vehicles ({vehicles.length})</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} • {v.registration_no || "Plate Unassigned"} ({v.total_units} units)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tab 1: Daily Allocation Matrix */}
      {activeTab === "matrix" && (
        <div className="rounded-2xl border border-ink-200 bg-white overflow-hidden shadow-xs">
          <div className="p-4 border-b border-ink-100 bg-ink-50/50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-ink-900">
                14-Day Fleet Branch Allocation Schedule
              </h3>
              <p className="text-xs text-ink-500">
                Live distribution of physical fleet units across branches by date
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReallocateVehicleId(selectedVehicleId !== "all" ? Number(selectedVehicleId) : undefined);
                setShowReallocateModal(true);
              }}
              className="btn-secondary text-[11px] py-1 px-2.5 font-semibold"
            >
              ⚙️ Modify Branch Quantities
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-[11px] font-semibold text-ink-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  {branches.map((b) => {
                    const isBlocked = Number(b.blocked) === 1;
                    return (
                      <th key={b.id} className={`py-3 px-4 text-center ${isBlocked ? "bg-rose-50/80 text-rose-900" : ""}`}>
                        <div className="flex items-center justify-center gap-1">
                          {isBlocked && <span>🔒</span>}
                          <span>{b.name}</span>
                          {isBlocked && (
                            <span className="ml-1 rounded-sm bg-rose-200 px-1 py-0.5 text-[9px] font-bold text-rose-900">
                              Blocked
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 text-center text-ink-500">Unallocated</th>
                  <th className="py-3 px-4 text-right font-bold text-ink-900">Total Fleet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {initialAllocations.map((row) => {
                  const d = new Date(row.date);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const formattedDate = d.toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-ink-50/70 transition ${isWeekend ? "bg-amber-50/30 font-medium" : ""}`}
                    >
                      <td className="py-3 px-4 font-semibold text-ink-900">
                        {formattedDate}
                        {isWeekend && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                            Weekend
                          </span>
                        )}
                      </td>

                      {branches.map((b) => {
                        const count = row.branches[b.name] ?? 0;
                        const isBlocked = Number(b.blocked) === 1;
                        return (
                          <td key={b.id} className={`py-3 px-4 text-center ${isBlocked ? "bg-stone-50/80" : ""}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setReallocateVehicleId(selectedVehicleId !== "all" ? Number(selectedVehicleId) : undefined);
                                setShowReallocateModal(true);
                              }}
                              className={`inline-block min-w-[28px] rounded-md px-2 py-0.5 font-bold hover:scale-105 transition cursor-pointer ${
                                isBlocked
                                  ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                                  : count > 0
                                  ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
                                  : "text-ink-300 hover:text-ink-500"
                              }`}
                              title={isBlocked ? "Branch is currently blocked" : "Click to edit branch distribution"}
                            >
                              {count}
                            </button>
                          </td>
                        );
                      })}

                      <td className="py-3 px-4 text-center text-ink-500">
                        {row.unallocated > 0 ? (
                          <span className="rounded-md bg-ink-100 px-2 py-0.5 font-semibold text-ink-700">
                            {row.unallocated}
                          </span>
                        ) : (
                          <span className="text-ink-300">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-ink-900">
                        {row.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Physical Units List & Direct Controls */}
      {activeTab === "units" && (
        <div className="rounded-2xl border border-ink-200 bg-white overflow-hidden shadow-xs">
          <div className="p-4 border-b border-ink-100 bg-ink-50/50 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-ink-900">
                Physical Inventory Units ({filteredUnits.length})
              </h3>
              <p className="text-xs text-ink-500">
                Independent physical vehicles with assigned branch, registration number, and edit controls
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-[11px] font-semibold text-ink-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Unit ID</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Registration</th>
                  <th className="py-3 px-4">Current Branch</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredUnits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-ink-500">
                      No physical units found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredUnits.map((u) => {
                    const branchMap = new Map(branches.map((b) => [b.id, b]));
                    const bObj = u.current_branch_id ? branchMap.get(u.current_branch_id) : null;
                    const isBranchBlocked = (bObj && Number(bObj.blocked) === 1) || Boolean(u.branch_blocked);
                    const isUnavailable = isBranchBlocked || u.status === "unavailable" || u.status === "blocked";

                    return (
                      <tr
                        key={u.id}
                        className={`transition ${
                          isUnavailable
                            ? "bg-stone-100/95 text-stone-500 opacity-65 grayscale-[50%]"
                            : "hover:bg-ink-50/70"
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-brand-700">
                          {u.unit_identifier}
                        </td>
                        <td className="py-3 px-4 font-medium text-ink-900">
                          {u.vehicle_name || "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-600">
                          {u.registration_no || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                              isBranchBlocked
                                ? "bg-rose-50 text-rose-800 border border-rose-300 font-bold"
                                : "bg-ink-100 text-ink-800"
                            }`}
                          >
                            📍 {u.current_branch_name || "Unallocated"} {isBranchBlocked ? "(Branch Hold)" : ""}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isBranchBlocked
                                ? "bg-rose-100 text-rose-900 ring-1 ring-rose-300"
                                : u.status === "available"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : u.status === "booked"
                                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            }`}
                          >
                            {isBranchBlocked ? "branch blocked" : u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setEditUnit(u)}
                            className="btn-secondary text-[11px] py-1 px-2.5 bg-ink-50 hover:bg-ink-100 text-ink-800"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferUnit(u)}
                            className="btn-secondary text-[11px] py-1 px-2.5 bg-brand-50 hover:bg-brand-100 text-brand-900 border-brand-200"
                          >
                            ⇄ Transfer
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reallocation Modal */}
      {showReallocateModal && (
        <VehicleReallocateModal
          vehicles={vehicles}
          branches={branches}
          units={units}
          initialVehicleId={reallocateVehicleId}
          onClose={() => {
            setShowReallocateModal(false);
            setReallocateVehicleId(undefined);
          }}
        />
      )}

      {/* Unit Edit Modal */}
      {editUnit && (
        <UnitEditModal
          unit={editUnit}
          branches={branches}
          onClose={() => setEditUnit(null)}
        />
      )}

      {/* Transfer Modal */}
      {transferUnit && (
        <BranchTransferModal
          unit={transferUnit}
          branches={branches}
          onClose={() => setTransferUnit(null)}
        />
      )}
    </div>
  );
}
