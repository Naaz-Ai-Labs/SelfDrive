"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PERIODS = [
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "This Month" },
  { key: "90d", label: "Last 3 Months" },
  { key: "180d", label: "Last 6 Months" },
  { key: "ytd", label: "Year to Date (YTD)" },
  { key: "all", label: "All Time" },
];

export function FinancialPeriodFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPeriod = searchParams.get("period") || "30d";

  function setPeriod(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    router.push(`/dashboard/reports?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-ink-100/60 p-1.5 rounded-xl border border-ink-200 shadow-xs">
      <span className="text-xs font-bold text-ink-500 px-2.5">Reporting Period:</span>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => setPeriod(p.key)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            currentPeriod === p.key
              ? "bg-brand-600 text-white shadow-xs"
              : "text-ink-600 hover:bg-ink-200/70"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
