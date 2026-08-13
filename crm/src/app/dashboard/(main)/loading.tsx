export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {/* Page title */}
      <div className="space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-80" />
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-7 w-20" />
            <div className="skeleton mt-2 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart + side panel */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-4 h-56 w-full" />
        </div>
        <div className="card space-y-3 p-4">
          <div className="skeleton h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-4">
        <div className="skeleton h-4 w-36" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
