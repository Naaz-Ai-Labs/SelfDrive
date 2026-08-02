import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getVehicles, getVehicleCategories } from "@/lib/data";
import { formatINR } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Browse Vehicles",
  description: "Browse our full fleet of self-drive bikes, scooters and cars with fixed, transparent pricing.",
};
export const revalidate = 60;

const FLEET_VIDEO = "https://videos.pexels.com/video-files/5061405/5061405-sd_640_360_30fps.mp4";

export default async function VehiclesPage({ searchParams }: { searchParams: { kind?: string; pickup?: string; return?: string } }) {
  const kind = searchParams.kind;
  const [categories, vehicles] = await Promise.all([getVehicleCategories(), getVehicles({ kind: kind || undefined })]);

  return (
    <>
      <section className="grain relative -mt-16 overflow-hidden border-b border-ink-100 bg-ink-950 pt-16 text-white">
        <Image src="/vehicles/mahindra-thar.avif" alt="" aria-hidden fill priority className="object-cover object-center" sizes="100vw" />
        <video
          className="hero-video absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          poster="/vehicles/mahindra-thar.avif"
          aria-hidden
          tabIndex={-1}
        >
          <source src={FLEET_VIDEO} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/40" aria-hidden />
        <div className="container-x relative py-16 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.28em] text-brand-300">
            {vehicles.length} vehicles available
          </span>
          <h1 className="mt-5 max-w-xl font-display text-4xl font-black leading-[1.02] sm:text-5xl">Browse our fleet</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70">
            Fixed pricing, no bargaining. Every vehicle shows its full price breakdown, deposit and kilometre allowance.
          </p>
        </div>
      </section>

      <section className="container-x py-12">
        <div className="flex flex-wrap gap-2">
          <Link href="/vehicles" className={`badge ring-1 ring-inset transition ${!kind ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-white text-ink-600 ring-ink-200 hover:border-brand-400"}`}>All</Link>
          {Array.from(new Map(categories.map((c) => [c.kind, c])).values()).map((c) => (
            <Link key={c.kind} href={`/vehicles?kind=${c.kind}`} className={`badge ring-1 ring-inset transition ${kind === c.kind ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-white text-ink-600 ring-ink-200 hover:border-brand-400"}`}>
              {c.icon && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={c.icon} /></svg>}
              {c.name}
            </Link>
          ))}
        </div>

        {vehicles.length === 0 ? (
          <div className="mt-8"><EmptyState title="No vehicles found" body="Try a different vehicle type." /></div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v, i) => (
              <Reveal key={v.id} delay={(i % 6) * 60}>
                <Link href={`/vehicles/${v.slug}${searchParams.pickup ? `?pickup=${searchParams.pickup}&return=${searchParams.return ?? ""}` : ""}`} className="group card block overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift">
                  <div className="relative h-44 overflow-hidden bg-ink-100">
                    {v.primary_photo && <Image src={v.primary_photo} alt={v.name} fill loading="lazy" className="object-contain p-4 transition-transform duration-500 group-hover:scale-110" sizes="(max-width:768px) 100vw, 33vw" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950/50 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
                    <span className="absolute left-3 top-3 badge bg-white/95 text-ink-800 shadow-sm">{v.category_name}</span>
                    <span className="absolute right-3 top-3 badge bg-ink-950/80 text-brand-300 shadow-sm">{v.transmission}</span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-semibold text-ink-900">{v.name}</h3>
                    <p className="mt-1 text-xs text-ink-500">{v.fuel_type} · {v.seats} seats · {v.included_km} km/day included</p>
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                      {formatINR(v.deposit)} refundable deposit
                    </p>
                    <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                      <p className="text-sm text-ink-500">
                        <span className="font-display text-xl font-semibold text-ink-900">{formatINR(v.rate_24h)}</span>
                        <span className="text-xs">/24h</span>
                      </p>
                      <span className="flex items-center gap-1 text-sm font-semibold text-brand-700 transition group-hover:gap-2">
                        View
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
