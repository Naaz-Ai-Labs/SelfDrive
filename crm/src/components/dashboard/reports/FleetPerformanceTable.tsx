"use client";

import { useState } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/utils";

export type VehiclePerformanceItem = {
  id: number;
  name: string;
  category: string;
  totalUnits: number;
  bookingsCount: number;
  daysRented: number;
  grossRevenue: number;
  extraKmRevenue: number;
  lateFeeRevenue: number;
  avgDailyRate: number;
  utilizationPct: number;
};

export function FleetPerformanceTable({
  vehicles = [],
}: {
  vehicles: VehiclePerformanceItem[];
}) {
  const [sortField, setSortField] = useState<keyof VehiclePerformanceItem>("grossRevenue");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedVehicles = [...vehicles].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  function toggleSort(field: keyof VehiclePerformanceItem) {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  return (
    <div className="card overflow-hidden shadow-sm border border-ink-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-5 bg-ink-50/50">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Fleet Vehicle Performance & ROI Matrix
          </h2>
          <p className="text-xs text-ink-500">
            Per-vehicle earnings, total days rented, extra KM charges, and average daily rental rate
          </p>
        </div>
        <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
          18 Active Fleet Models
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-100/60 font-bold uppercase tracking-wider text-ink-700 border-b border-ink-200">
            <tr>
              <th className="p-3.5 cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("name")}>
                Vehicle Model {sortField === "name" ? (sortAsc ? "▲" : "▼") : ""}
              </th>
              <th className="p-3.5 cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("category")}>
                Category
              </th>
              <th className="p-3.5 text-center cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("bookingsCount")}>
                Bookings {sortField === "bookingsCount" ? (sortAsc ? "▲" : "▼") : ""}
              </th>
              <th className="p-3.5 text-center cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("daysRented")}>
                Days Rented
              </th>
              <th className="p-3.5 text-center cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("utilizationPct")}>
                Utilization % {sortField === "utilizationPct" ? (sortAsc ? "▲" : "▼") : ""}
              </th>
              <th className="p-3.5 text-right cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("avgDailyRate")}>
                Avg Daily Rate {sortField === "avgDailyRate" ? (sortAsc ? "▲" : "▼") : ""}
              </th>
              <th className="p-3.5 text-right cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("extraKmRevenue")}>
                Extra KM Fees
              </th>
              <th className="p-3.5 text-right cursor-pointer hover:bg-ink-200/60" onClick={() => toggleSort("grossRevenue")}>
                Gross Revenue {sortField === "grossRevenue" ? (sortAsc ? "▲" : "▼") : ""}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 font-medium">
            {sortedVehicles.map((v) => (
              <tr key={v.id} className="hover:bg-brand-50/30 transition">
                <td className="p-3.5 font-bold text-ink-900">
                  <Link href={`/dashboard/vehicles/${v.id}`} className="hover:text-brand-700 hover:underline">
                    {v.name}
                  </Link>
                  <span className="block text-[10px] font-normal text-ink-400">
                    {v.totalUnits} Unit{v.totalUnits > 1 ? "s" : ""} in fleet
                  </span>
                </td>
                <td className="p-3.5 text-ink-600">
                  <span className="badge bg-ink-100 text-ink-700 text-[10px]">
                    {v.category}
                  </span>
                </td>
                <td className="p-3.5 text-center font-bold text-ink-900">
                  {v.bookingsCount}
                </td>
                <td className="p-3.5 text-center text-ink-700">
                  {v.daysRented} days
                </td>
                <td className="p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-12 h-2 rounded-full bg-ink-100 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${Math.min(100, v.utilizationPct)}%` }}
                      />
                    </div>
                    <span className="font-bold text-[11px] text-ink-800">
                      {v.utilizationPct.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="p-3.5 text-right font-mono text-ink-800">
                  {formatINR(v.avgDailyRate)}
                </td>
                <td className="p-3.5 text-right font-mono text-emerald-700">
                  +{formatINR(v.extraKmRevenue)}
                </td>
                <td className="p-3.5 text-right font-bold font-mono text-emerald-800 text-sm">
                  {formatINR(v.grossRevenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
