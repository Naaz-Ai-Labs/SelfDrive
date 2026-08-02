export function Marquee({ items }: { items: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-white/10 bg-ink-950 py-3" aria-hidden>
      <div className="marquee-track">
        {loop.map((item, i) => (
          <span key={i} className="mx-4 flex shrink-0 items-center gap-4 text-xs font-bold uppercase tracking-[0.25em] text-white/50">
            {item}
            <span className="text-brand-500">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
