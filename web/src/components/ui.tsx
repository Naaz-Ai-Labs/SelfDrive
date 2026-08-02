import Link from "next/link";
import { cn } from "@/lib/utils";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-amber-500", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="15" height="15" viewBox="0 0 20 20" fill={i <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-600">{eyebrow}</p>
      )}
      <h2 className="mt-3 font-display text-3xl font-semibold text-ink-900 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-ink-600">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink-800">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-500">{body}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    New: "bg-blue-50 text-blue-700 ring-blue-200",
    Contacted: "bg-sky-50 text-sky-700 ring-sky-200",
    "Documents pending": "bg-violet-50 text-violet-700 ring-violet-200",
    "Payment pending": "bg-yellow-50 text-yellow-700 ring-yellow-200",
    "Follow-up": "bg-amber-50 text-amber-700 ring-amber-200",
    Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Lost: "bg-red-50 text-red-700 ring-red-200",
    Cancelled: "bg-stone-100 text-stone-600 ring-stone-200",
    Completed: "bg-green-50 text-green-700 ring-green-200",
    Draft: "bg-stone-100 text-stone-600 ring-stone-200",
    "Pending verification": "bg-violet-50 text-violet-700 ring-violet-200",
    "Payment received": "bg-teal-50 text-teal-700 ring-teal-200",
    "Ready for pickup": "bg-cyan-50 text-cyan-700 ring-cyan-200",
    "Vehicle handed over": "bg-indigo-50 text-indigo-700 ring-indigo-200",
    "Active rental": "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Return pending": "bg-orange-50 text-orange-700 ring-orange-200",
    "Vehicle returned": "bg-sky-50 text-sky-700 ring-sky-200",
    "Inspection pending": "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    "Additional charges pending": "bg-orange-50 text-orange-700 ring-orange-200",
    "Refund pending": "bg-amber-50 text-amber-700 ring-amber-200",
    Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Pending: "bg-amber-50 text-amber-700 ring-amber-200",
    "Partially paid": "bg-orange-50 text-orange-700 ring-orange-200",
    Overdue: "bg-red-50 text-red-700 ring-red-200",
    Refunded: "bg-stone-100 text-stone-600 ring-stone-200",
    Failed: "bg-red-50 text-red-700 ring-red-200",
    Requested: "bg-blue-50 text-blue-700 ring-blue-200",
    "Under review": "bg-violet-50 text-violet-700 ring-violet-200",
    Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Partially approved": "bg-orange-50 text-orange-700 ring-orange-200",
    Rejected: "bg-red-50 text-red-700 ring-red-200",
    Processing: "bg-sky-50 text-sky-700 ring-sky-200",
    Open: "bg-red-50 text-red-700 ring-red-200",
    "In progress": "bg-amber-50 text-amber-700 ring-amber-200",
    Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    available: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    booked: "bg-amber-50 text-amber-700 ring-amber-200",
    maintenance: "bg-red-50 text-red-700 ring-red-200",
    archived: "bg-stone-100 text-stone-600 ring-stone-200",
  };
  const cls = palette[status] ?? "bg-ink-100 text-ink-700 ring-ink-200";
  return (
    <span className={cn("badge ring-1 ring-inset", cls)}>{status}</span>
  );
}

export function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === "High" ? "bg-red-500" : priority === "Urgent" ? "bg-red-600" : priority === "Low" ? "bg-ink-300" : "bg-amber-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
      <span className={cn("h-2 w-2 rounded-full", color)} aria-hidden />
      {priority}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "emerald" | "amber" | "red" | "ink";
}) {
  const accentMap = {
    brand: "text-brand-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    ink: "text-ink-900",
  };
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={cn("mt-2 font-display text-2xl font-semibold", accentMap[accent ?? "ink"])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function Pagination({ total, page, perPage, base }: { total: number; page: number; perPage: number; base: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={`${base}${p === 1 ? "" : `?page=${p}`}`}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition",
            p === page ? "bg-brand-600 text-white" : "bg-white/60 text-ink-600 ring-1 ring-white/60 backdrop-blur-sm hover:ring-brand-400"
          )}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600/15 font-semibold text-brand-700", sizes[size])} aria-hidden>
      {initials}
    </span>
  );
}

export function FormField({
  label,
  error,
  hint,
  children,
  id,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
