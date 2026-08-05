"use client";

import { useState } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/utils";

type VehicleItem = {
  id: number;
  name: string;
  category: string;
  totalUnits: number;
  availableUnits: number;
  status: string;
  rate24h: number;
};

type BookingBlock = {
  id: number;
  bookingNo: string;
  customerName: string;
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  status: string;
};

export function FleetGanttCalendar({
  vehicles = [],
  bookings = [],
}: {
  vehicles?: VehicleItem[];
  bookings?: BookingBlock[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [hoveredBooking, setHoveredBooking] = useState<BookingBlock | null>(null);

  // Generate 7-day timeline window
  const days: Date[] = [];
  const now = new Date();
  for (let i = -1; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    days.push(d);
  }

  const categories = Array.from(new Set(vehicles.map((v) => v.category))).filter(Boolean);
  const filteredVehicles = vehicles.filter(
    (v) => selectedCategory === "all" || v.category === selectedCategory
  );

  function getStatusColor(status: string) {
    switch (status) {
      case "Active rental":
      case "Vehicle handed over":
        return "bg-emerald-500 text-white border-emerald-600";
      case "Confirmed":
        return "bg-amber-500 text-white border-amber-600";
      case "Pending verification":
        return "bg-purple-500 text-white border-purple-600";
      default:
        return "bg-blue-500 text-white border-blue-600";
    }
  }

  return (
    <div className="card p-6 space-y-4 shadow-sm border border-ink-200">
      {/* Gantt Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Interactive Fleet Gantt Timeline Schedule
            </h2>
            <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
              Live Fleet Matrix
            </span>
          </div>
          <p className="text-xs text-ink-500">
            Real-time schedule timeline for all 18 vehicles, active rentals, and upcoming pickup slots
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
              selectedCategory === "all"
                ? "bg-brand-600 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            All Categories ({vehicles.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                selectedCategory === cat
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Hover Info Tooltip */}
      {hoveredBooking && (
        <div className="rounded-xl border border-brand-300 bg-brand-50/50 p-3 text-xs flex flex-wrap items-center justify-between gap-2 animate-fadeIn">
          <div>
            <span className="font-bold text-ink-900">{hoveredBooking.bookingNo}</span> • Customer:{" "}
            <strong>{hoveredBooking.customerName}</strong> • Schedule:{" "}
            <span className="font-mono">{hoveredBooking.pickupAt.slice(0, 16)} → {hoveredBooking.returnAt.slice(0, 16)}</span>
          </div>
          <Link
            href={`/dashboard/bookings/${hoveredBooking.id}`}
            className="btn-primary px-2.5 py-1 text-[11px]"
          >
            View Booking →
          </Link>
        </div>
      )}

      {/* Gantt Grid Table */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Timeline Days Row Header */}
          <div className="grid grid-cols-8 border-b border-ink-200 bg-ink-50/60 pb-2 pt-2 text-xs font-bold text-ink-700">
            <div className="px-3">Vehicle / Fleet</div>
            {days.map((d, idx) => {
              const isToday = d.toDateString() === now.toDateString();
              return (
                <div
                  key={idx}
                  className={`text-center py-1 rounded-md ${
                    isToday ? "bg-brand-500/20 text-brand-900 font-extrabold" : ""
                  }`}
                >
                  <span className="block text-[10px] uppercase text-ink-400">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span>{d.getDate()} {d.toLocaleDateString("en-US", { month: "short" })}</span>
                </div>
              );
            })}
          </div>

          {/* Vehicle Rows */}
          <div className="divide-y divide-ink-100">
            {filteredVehicles.map((v) => {
              const vBookings = bookings.filter((b) => b.vehicleId === v.id);

              return (
                <div key={v.id} className="grid grid-cols-8 items-center py-2.5 hover:bg-ink-50/40">
                  {/* Left Column: Vehicle Info */}
                  <div className="px-3 min-w-0">
                    <Link
                      href={`/dashboard/vehicles/${v.id}`}
                      className="font-bold text-xs text-ink-900 hover:text-brand-700 truncate block"
                    >
                      {v.name}
                    </Link>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                      <span className="text-ink-500">{formatINR(v.rate24h)}/24h</span> •{" "}
                      <span className="font-semibold text-emerald-700">
                        {v.availableUnits}/{v.totalUnits} Units
                      </span>
                    </div>
                  </div>

                  {/* 7 Timeline Day Cells */}
                  {days.map((d, dIdx) => {
                    const dayStr = d.toISOString().slice(0, 10);
                    const matchingBooking = vBookings.find((b) => {
                      const pickupDate = b.pickupAt.slice(0, 10);
                      const returnDate = b.returnAt.slice(0, 10);
                      return dayStr >= pickupDate && dayStr <= returnDate;
                    });

                    return (
                      <div key={dIdx} className="px-1 text-center">
                        {matchingBooking ? (
                          <div
                            onMouseEnter={() => setHoveredBooking(matchingBooking)}
                            onMouseLeave={() => setHoveredBooking(null)}
                            className={`rounded-lg px-1.5 py-1 text-[10px] font-bold truncate border shadow-xs cursor-pointer transition transform hover:scale-105 ${getStatusColor(
                              matchingBooking.status
                            )}`}
                          >
                            {matchingBooking.customerName.split(" ")[0]}
                          </div>
                        ) : (
                          <div className="h-6 rounded bg-ink-100/40 hover:bg-emerald-100/40 flex items-center justify-center text-[10px] text-ink-300">
                            Available
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
