"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Vehicle, VehicleUnit, Branch } from "@/lib/data";
import type { FleetBlock } from "@/lib/fleet-page-data";
import { bulkUpdateUnitStatus, bulkUpdateVehicleStatus, blockVehicleDates, unblockVehicleDates } from "@/lib/actions";
import { formatINR } from "@/lib/utils";
import Link from "next/link";
import { getCategoryPresetPhoto } from "@/lib/data";

/** Date-only input gives "YYYY-MM-DD"; a block needs the full IST day span. Same
 * boundaries FleetGanttCalendar's click-a-day block uses, so a plate blocked here and
 * one blocked from the timeline behave identically. */
function istDayBounds(dayKey: string): { startsAt: string; endsAt: string } {
  return { startsAt: `${dayKey}T00:00:00+05:30`, endsAt: `${dayKey}T23:59:59+05:30` };
}
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // en-CA = YYYY-MM-DD
}

export function FleetUnitBlockManager({
  vehicles,
  units,
  branches,
  blocks,
}: {
  vehicles: Vehicle[];
  units: VehicleUnit[];
  branches: Branch[];
  blocks: FleetBlock[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<"units" | "vehicles">("units");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");

  // Date-scoped blocking: the correct, self-clearing mechanism for "off the road for a
  // known period" — a block that only affects the dates it names, and needs no one to
  // remember to undo it. This is what "Block Selected" now opens, instead of the
  // permanent, date-blind status flip bulkUpdateUnitStatus performs.
  const [showBlockPanel, setShowBlockPanel] = useState(false);
  const [blockDuration, setBlockDuration] = useState<"1day" | "custom">("1day");
  const [blockStart, setBlockStart] = useState(todayKey());
  const [blockEnd, setBlockEnd] = useState(todayKey());
  const [blockReasonKind, setBlockReasonKind] = useState<"maintenance" | "manual_block">("maintenance");
  const [blockNotes, setBlockNotes] = useState("");

  // Arrived from the Fleet Timeline's "Block a range…" link for one specific vehicle —
  // pre-select its active units and open the panel so staff don't have to search/filter
  // for the vehicle they just clicked.
  useEffect(() => {
    const vehicleId = Number(searchParams.get("vehicleId"));
    if (!vehicleId) return;
    const unitIds = units.filter((u) => u.vehicle_id === vehicleId && u.active !== 0).map((u) => u.id);
    if (unitIds.length === 0) return;
    setActiveTab("units");
    setSelectedUnitIds(unitIds);
    setShowBlockPanel(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitDurationBlock() {
    const endKey = blockDuration === "1day" ? blockStart : blockEnd;
    if (!blockStart || !endKey) return setActionError("Pick a start date.");
    if (endKey < blockStart) return setActionError("End date must be on or after the start date.");
    if (!blockNotes.trim()) return setActionError("Enter a reason — this takes each selected unit off every date in the range.");

    const { startsAt } = istDayBounds(blockStart);
    const { endsAt } = istDayBounds(endKey);
    const targets = units.filter((u) => selectedUnitIds.includes(u.id));

    setActionError("");
    setActionSuccess("");
    startTransition(async () => {
      const results = await Promise.all(
        targets.map((u) =>
          blockVehicleDates({
            vehicleId: u.vehicle_id,
            vehicleUnitId: u.id,
            startsAt,
            endsAt,
            reason: blockReasonKind,
            notes: blockNotes.trim(),
          })
        )
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setActionError(`${failed.length} of ${targets.length} unit(s) could not be blocked: ${failed[0].error}`);
      } else {
        setActionSuccess(`Blocked ${targets.length} unit(s) from ${blockStart}${endKey !== blockStart ? ` to ${endKey}` : ""}.`);
      }
      setSelectedUnitIds([]);
      setShowBlockPanel(false);
      setBlockNotes("");
      router.refresh();
    });
  }

  function handleUnblockDateRange(blockId: number) {
    setActionError("");
    startTransition(async () => {
      const res = await unblockVehicleDates(blockId);
      if (!res.ok) setActionError(res.error || "Could not lift that block.");
      router.refresh();
    });
  }

  const branchMap = new Map(branches.map((b) => [b.id, b]));

  // Filter units
  const filteredUnits = units.filter((u) => {
    const bObj = u.current_branch_id ? branchMap.get(u.current_branch_id) : null;
    const isBranchBlocked = (bObj && Number(bObj.blocked) === 1) || Boolean(u.branch_blocked);
    const isUnitUnavailable = isBranchBlocked || u.status === "unavailable" || u.status === "blocked";

    if (branchFilter !== "all" && String(u.current_branch_id) !== branchFilter) return false;
    if (statusFilter === "available" && isUnitUnavailable) return false;
    if (statusFilter === "unavailable" && !isUnitUnavailable) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const plate = (u.registration_no || "").toLowerCase();
      const name = (u.vehicle_name || "").toLowerCase();
      const ident = (u.unit_identifier || "").toLowerCase();
      if (!plate.includes(q) && !name.includes(q) && !ident.includes(q)) return false;
    }
    return true;
  });

  // Filter vehicles
  const filteredVehicles = vehicles.filter((v) => {
    const bId = branchFilter !== "all" ? Number(branchFilter) : null;
    const branchUnits = bId && v.units ? v.units.filter((u) => u.current_branch_id === bId) : (v.units || []);
    const branchDistItem = bId && v.branch_distribution ? v.branch_distribution.find((d) => d.branch_id === bId) : null;
    const isSelectedBranchBlocked = bId ? Number(branchMap.get(bId)?.blocked) === 1 : false;

    if (branchFilter !== "all") {
      const hasUnits =
        (v.units && v.units.some((u) => u.current_branch_id === bId)) ||
        (v.branch_distribution && v.branch_distribution.some((d) => d.branch_id === bId && d.total_units > 0)) ||
        (v.branch_id === bId);
      if (!hasUnits) return false;
    }

    const displayTotalUnits = bId
      ? (branchUnits.length > 0 ? branchUnits.length : (branchDistItem?.total_units ?? (v.branch_id === bId ? (v.total_units ?? 1) : 0)))
      : (v.total_units ?? (v.units?.length || 1));

    const displayAvailableUnits = isSelectedBranchBlocked
      ? 0
      : (bId
        ? (branchUnits.length > 0 ? branchUnits.filter((u) => u.status === "available" && !u.branch_blocked).length : (branchDistItem?.available_units ?? (v.branch_id === bId ? (v.available_units ?? 1) : 0)))
        : (v.available_units ?? displayTotalUnits));

    const isUnavail = displayAvailableUnits === 0 || v.status === "unavailable" || v.status === "blocked";
    if (statusFilter === "available" && isUnavail) return false;
    if (statusFilter === "unavailable" && !isUnavail) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (v.name || "").toLowerCase();
      const plate = (v.registration_no || "").toLowerCase();
      if (!name.includes(q) && !plate.includes(q)) return false;
    }
    return true;
  });

  // Unit selection helpers
  const allFilteredUnitIds = filteredUnits.map((u) => u.id);
  const isAllUnitsSelected = allFilteredUnitIds.length > 0 && allFilteredUnitIds.every((id) => selectedUnitIds.includes(id));

  function toggleSelectAllUnits() {
    if (isAllUnitsSelected) {
      setSelectedUnitIds((prev) => prev.filter((id) => !allFilteredUnitIds.includes(id)));
    } else {
      setSelectedUnitIds((prev) => Array.from(new Set([...prev, ...allFilteredUnitIds])));
    }
  }

  function toggleUnitSelection(id: number) {
    setSelectedUnitIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  // Vehicle selection helpers
  const allFilteredVehicleIds = filteredVehicles.map((v) => v.id);
  const isAllVehiclesSelected = allFilteredVehicleIds.length > 0 && allFilteredVehicleIds.every((id) => selectedVehicleIds.includes(id));

  function toggleSelectAllVehicles() {
    if (isAllVehiclesSelected) {
      setSelectedVehicleIds((prev) => prev.filter((id) => !allFilteredVehicleIds.includes(id)));
    } else {
      setSelectedVehicleIds((prev) => Array.from(new Set([...prev, ...allFilteredVehicleIds])));
    }
  }

  function toggleVehicleSelection(id: number) {
    setSelectedVehicleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  // Handle Bulk Status Actions
  function handleBulkUnits(status: "available" | "unavailable") {
    if (selectedUnitIds.length === 0) return;
    const promptMsg =
      status === "unavailable"
        ? `Are you sure you want to block ${selectedUnitIds.length} unit(s)? Only these specific license plates will become unavailable for customer bookings.`
        : `Unblock ${selectedUnitIds.length} unit(s) and make them available for customer bookings?`;

    if (!confirm(promptMsg)) return;

    setActionError("");
    setActionSuccess("");

    startTransition(async () => {
      const res = await bulkUpdateUnitStatus(selectedUnitIds, status);
      if (res.ok) {
        setActionSuccess(`Successfully updated ${res.count} vehicle unit(s) to "${status}".`);
        setSelectedUnitIds([]);
        router.refresh();
      } else {
        setActionError(res.error || "Failed to update units.");
      }
    });
  }

  function handleBulkVehicles(status: "available" | "unavailable") {
    if (selectedVehicleIds.length === 0) return;
    const promptMsg =
      status === "unavailable"
        ? `Block ${selectedVehicleIds.length} vehicle model(s)? All units of these vehicles will become unavailable and greyed out.`
        : `Unblock ${selectedVehicleIds.length} vehicle model(s) and make available?`;

    if (!confirm(promptMsg)) return;

    setActionError("");
    setActionSuccess("");

    startTransition(async () => {
      const res = await bulkUpdateVehicleStatus(selectedVehicleIds, status);
      if (res.ok) {
        setActionSuccess(`Successfully updated ${res.count} vehicle(s) to "${status}".`);
        setSelectedVehicleIds([]);
        router.refresh();
      } else {
        setActionError(res.error || "Failed to update vehicles.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Tab Switcher & Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("units");
                setSelectedVehicleIds([]);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === "units"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              🚗 By License Plate Units ({units.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("vehicles");
                setSelectedUnitIds([]);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTab === "vehicles"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              📦 By Vehicle Model Roster ({vehicles.length})
            </button>
          </div>

          <p className="text-xs text-ink-500 font-medium">
            {activeTab === "units"
              ? "Select specific license plates to block singular physical vehicles without disabling the whole model."
              : "Bulk block or manage overall fleet model availability."}
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder={activeTab === "units" ? "Search license plate or vehicle name..." : "Search vehicle name..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input py-1.5 text-xs font-medium w-full"
            />
          </div>

          <div className="w-48">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="input py-1.5 text-xs font-medium"
            >
              <option value="all">🏢 All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  🏢 {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input py-1.5 text-xs font-medium"
            >
              <option value="all">Status: All Units</option>
              <option value="available">🟢 Available Only</option>
              <option value="unavailable">🔴 Unavailable (Blocked) Only</option>
            </select>
          </div>
        </div>

        {actionSuccess && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-medium flex items-center justify-between">
            <span>✓ {actionSuccess}</span>
            <button onClick={() => setActionSuccess("")} className="text-emerald-900 font-bold ml-2">✕</button>
          </div>
        )}

        {actionError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800 font-medium flex items-center justify-between">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError("")} className="text-rose-900 font-bold ml-2">✕</button>
          </div>
        )}
      </div>

      {/* Bulk Action Sticky Bar when items are selected */}
      {(selectedUnitIds.length > 0 || selectedVehicleIds.length > 0) && (
        <div className="card p-3 bg-brand-50 border border-brand-200 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white font-bold text-xs h-6 w-6">
              {activeTab === "units" ? selectedUnitIds.length : selectedVehicleIds.length}
            </span>
            <span className="text-xs font-semibold text-brand-900">
              {activeTab === "units" ? "License Plate Unit(s) Selected" : "Vehicle Model(s) Selected"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => (activeTab === "units" ? setShowBlockPanel(true) : handleBulkVehicles("unavailable"))}
              className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition disabled:opacity-50"
            >
              {pending ? "…" : activeTab === "units" ? "📅 Block Selected (Choose Dates)" : "🚫 Block Selected (Mark Unavailable)"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => (activeTab === "units" ? handleBulkUnits("available") : handleBulkVehicles("available"))}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition disabled:opacity-50"
            >
              {pending ? "…" : "✅ Unblock Selected (Lift Permanent Flag)"}
            </button>
            <button
              type="button"
              onClick={() => (activeTab === "units" ? setSelectedUnitIds([]) : setSelectedVehicleIds([]))}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Duration block panel — the actual feature: a block that only affects the dates
          it names, and clears itself instead of needing anyone to remember to undo it. */}
      {showBlockPanel && activeTab === "units" && (
        <div className="card p-4 space-y-3 border-2 border-red-200 bg-red-50/40">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">
              Block {selectedUnitIds.length} unit(s) for a period
            </h3>
            <button type="button" onClick={() => setShowBlockPanel(false)} className="text-xs text-ink-500 hover:text-ink-900">
              ✕ Cancel
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBlockDuration("1day")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${blockDuration === "1day" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
            >
              1 Day
            </button>
            <button
              type="button"
              onClick={() => setBlockDuration("custom")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${blockDuration === "custom" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
            >
              Custom Range
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label text-[10px] uppercase font-bold text-ink-400">
                {blockDuration === "1day" ? "Date" : "Start date"}
              </label>
              <input type="date" className="input text-xs py-1.5" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
            </div>
            {blockDuration === "custom" && (
              <div>
                <label className="label text-[10px] uppercase font-bold text-ink-400">End date</label>
                <input type="date" className="input text-xs py-1.5" min={blockStart} value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label text-[10px] uppercase font-bold text-ink-400">Reason</label>
              <select className="input text-xs py-1.5" value={blockReasonKind} onChange={(e) => setBlockReasonKind(e.target.value as "maintenance" | "manual_block")}>
                <option value="maintenance">Maintenance</option>
                <option value="manual_block">Manual block</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label text-[10px] uppercase font-bold text-ink-400">Notes (required)</label>
            <input
              className="input text-xs py-1.5"
              value={blockNotes}
              placeholder="e.g. Engine service, back Friday"
              onChange={(e) => setBlockNotes(e.target.value)}
            />
          </div>

          <button type="button" disabled={pending} onClick={submitDurationBlock} className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-bold shadow-xs transition disabled:opacity-50">
            {pending ? "Blocking…" : "Confirm block"}
          </button>
        </div>
      )}

      {/* Active date-scoped blocks — the ones this panel creates, and the ones the Fleet
          Timeline's click-a-day block creates. Both use the same table, so both show here. */}
      {activeTab === "units" && blocks.length > 0 && (
        <div className="card overflow-x-auto shadow-sm">
          <div className="border-b border-ink-100 bg-ink-50/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            Active Temporary Blocks ({blocks.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                <th className="px-4 py-2 font-semibold">Plate / Unit</th>
                <th className="px-4 py-2 font-semibold">Dates</th>
                <th className="px-4 py-2 font-semibold">Reason</th>
                <th className="px-4 py-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => {
                const unit = b.vehicleUnitId ? units.find((u) => u.id === b.vehicleUnitId) : null;
                const vehicle = vehicles.find((v) => v.id === b.vehicleId);
                return (
                  <tr key={b.id} className="border-b border-ink-50">
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-ink-800">
                      {unit ? `${unit.registration_no || unit.unit_identifier}` : `${vehicle?.name || "Vehicle"} (all units)`}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-600">
                      {new Date(b.startsAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}
                      {" – "}
                      {new Date(b.endsAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-600">{b.notes || b.reason}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleUnblockDateRange(b.id)}
                        className="px-2.5 py-1 rounded text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      >
                        Lift block
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 1: Physical Units by License Plate */}
      {activeTab === "units" && (
        <div className="card overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-50/50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isAllUnitsSelected}
                    onChange={toggleSelectAllUnits}
                    className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    title="Select all filtered units"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">License Plate / Unit</th>
                <th className="px-4 py-3 font-semibold">Vehicle Model</th>
                <th className="px-4 py-3 font-semibold">Assigned Branch</th>
                <th className="px-4 py-3 font-semibold">Unit Status</th>
                <th className="px-4 py-3 font-semibold text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-ink-400">
                    No vehicle units found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((u) => {
                  const bObj = u.current_branch_id ? branchMap.get(u.current_branch_id) : null;
                  const isBranchBlocked = (bObj && Number(bObj.blocked) === 1) || Boolean(u.branch_blocked);
                  const isUnavailable = isBranchBlocked || u.status === "unavailable" || u.status === "blocked";
                  const isSelected = selectedUnitIds.includes(u.id);

                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-ink-50 transition-colors ${
                        isUnavailable
                          ? "bg-stone-100/95 text-stone-500 opacity-65 grayscale-[50%]"
                          : isSelected
                            ? "bg-brand-50/40"
                            : "hover:bg-ink-50/40"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleUnitSelection(u.id)}
                          className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-ink-900 flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs tracking-wider font-mono uppercase ${
                            isUnavailable ? "bg-stone-200 text-stone-700" : "bg-ink-100 text-ink-900 border border-ink-200"
                          }`}>
                            {u.registration_no || "No Plate Number"}
                          </span>
                          <span className="text-[11px] text-ink-400 font-normal">({u.unit_identifier})</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-800">
                        {u.vehicle_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {u.current_branch_name ? (
                          <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
                            isBranchBlocked
                              ? "bg-rose-50 border border-rose-300 text-rose-800 font-bold"
                              : "bg-brand-50 border border-brand-200 text-brand-800"
                          }`}>
                            🏢 {u.current_branch_name} {isBranchBlocked ? "(Branch Hold)" : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-400">Unallocated</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isBranchBlocked ? (
                          <span className="badge bg-rose-100 text-rose-900 font-bold border border-rose-300">
                            🏢 Branch Blocked
                          </span>
                        ) : isUnavailable ? (
                          <span className="badge bg-red-100 text-red-800 font-bold border border-red-200">
                            Unavailable (Blocked)
                          </span>
                        ) : u.status === "booked" ? (
                          <span className="badge bg-amber-100 text-amber-800 font-semibold">
                            Booked
                          </span>
                        ) : (
                          <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
                            Available (Active)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (isUnavailable) {
                              setSelectedUnitIds([u.id]);
                              handleBulkUnits("available");
                            } else {
                              setSelectedUnitIds([u.id]);
                              setShowBlockPanel(true);
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
                            isUnavailable
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                          }`}
                        >
                          {isUnavailable ? "Unblock Unit" : "Block Unit"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Overall Vehicle Model Roster */}
      {activeTab === "vehicles" && (
        <div className="card overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-50/50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isAllVehiclesSelected}
                    onChange={toggleSelectAllVehicles}
                    className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Fleet Units</th>
                <th className="px-4 py-3 font-semibold">24h Rate</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-ink-400">
                    No vehicles found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v) => {
                  const bId = branchFilter !== "all" ? Number(branchFilter) : null;
                  const branchUnits = bId && v.units ? v.units.filter((u) => u.current_branch_id === bId) : (v.units || []);
                  const branchDistItem = bId && v.branch_distribution ? v.branch_distribution.find((d) => d.branch_id === bId) : null;

                  const displayTotalUnits = bId
                    ? (branchUnits.length > 0 ? branchUnits.length : (branchDistItem?.total_units ?? (v.branch_id === bId ? (v.total_units ?? 1) : 0)))
                    : (v.total_units ?? (v.units?.length || 1));

                  const displayAvailableUnits = bId
                    ? (branchUnits.length > 0 ? branchUnits.filter((u) => u.status === "available").length : (branchDistItem?.available_units ?? (v.branch_id === bId ? (v.available_units ?? 1) : 0)))
                    : (v.available_units ?? displayTotalUnits);

                  const isUnavailable =
                    displayAvailableUnits === 0 ||
                    v.status === "unavailable" ||
                    v.status === "blocked";
                  const isSelected = selectedVehicleIds.includes(v.id);
                  const selectedBranchName = bId ? branches.find((b) => b.id === bId)?.name : v.branch_name;

                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-ink-50 transition-colors ${
                        isUnavailable
                          ? "bg-stone-100/90 text-stone-500 opacity-60 grayscale-[40%]"
                          : isSelected
                            ? "bg-brand-50/40"
                            : "hover:bg-ink-50/40"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVehicleSelection(v.id)}
                          className="rounded border-ink-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={v.photos && v.photos.length > 0 ? v.photos[0] : getCategoryPresetPhoto(v.category_slug || v.category_name, v.slug)}
                            alt={v.name}
                            className="h-10 w-14 rounded-lg object-cover border border-ink-200 shadow-xs"
                          />
                          <div>
                            <Link href={`/dashboard/vehicles/${v.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                              {v.name}
                            </Link>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-ink-400">{v.registration_no ?? "—"}</span>
                              {selectedBranchName && (
                                <span className="inline-flex items-center rounded-sm bg-brand-50 border border-brand-200 px-1.5 py-0.2 text-[10px] font-semibold text-brand-800">
                                  🏢 {selectedBranchName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{v.category_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink-900 bg-ink-100 px-2 py-0.5 rounded text-xs">
                          📦 {displayTotalUnits} Unit{displayTotalUnits === 1 ? "" : "s"} {bId ? `(${selectedBranchName || "Branch"})` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-800">{formatINR(v.rate_24h)}</td>
                      <td className="px-4 py-3">
                        {isUnavailable ? (
                          <span className="badge bg-stone-200 text-stone-700 font-bold border border-stone-300">
                            Unavailable (0/{displayTotalUnits})
                          </span>
                        ) : (
                          <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
                            {displayAvailableUnits}/{displayTotalUnits} Available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/vehicles/${v.id}`} className="btn-secondary px-3 py-1 text-xs">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
