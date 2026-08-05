type Row = { label: string; value: number };

export function BarRows({ data }: { data: Row[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-400">No data yet.</p>;
  }
  return (
    <div className="space-y-3">
      {data.map((d, idx) => (
        <div key={d.label || `bar-${idx}`} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-ink-600">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (d.value / max) * 100)}%` }} />
          </div>
          <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-800">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
