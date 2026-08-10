type Point = { label: string; value: number };

export function AreaTrend({ data, height = 200 }: { data: Point[]; height?: number }) {
  const width = 500;
  const padY = 16;
  const padX = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : width;

  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padY + (height - padY * 2) * (1 - d.value / max);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? width},${height - padY} L${padX},${height - padY} Z`;

  return (
    <div className="w-full">
      <div className="w-full h-44 sm:h-52">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Trend chart">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-accent, #f2b705)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--chart-accent, #f2b705)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1="0" x2={width} y1={padY + (height - padY * 2) * t} y2={padY + (height - padY * 2) * t} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
          ))}
          <path d={areaPath} fill="url(#areaFill)" />
          <path d={linePath} fill="none" stroke="var(--chart-accent, #f2b705)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4.5 : 3} fill="var(--chart-accent, #f2b705)" stroke="#fff" strokeWidth="1.5" />
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-400">
        {data.map((d, idx) => (
          <span key={d.label || `trend-${idx}`}>{d.label || `M${idx + 1}`}</span>
        ))}
      </div>
    </div>
  );
}
