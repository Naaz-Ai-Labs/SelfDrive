type Point = { label: string; value: number };

export function AreaTrend({ data, height = 220 }: { data: Point[]; height?: number }) {
  const width = 640;
  const padY = 20;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = padY + (height - padY * 2) * (1 - d.value / max);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? 0},${height - padY} L0,${height - padY} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full min-w-[480px]" preserveAspectRatio="none" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-accent, #2563eb)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-accent, #2563eb)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1="0" x2={width} y1={padY + (height - padY * 2) * t} y2={padY + (height - padY * 2) * t} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        ))}
        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke="var(--chart-accent, #2563eb)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill="var(--chart-accent, #2563eb)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-400" style={{ minWidth: 480 }}>
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
