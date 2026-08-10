import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getVehicles, getVehicleCategories } from "@/lib/data";
import { formatINR, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { Reveal } from "@/components/ui/Reveal";
import { isWeekend } from "@/lib/pricing";
import { BookingBar } from "@/components/BookingBar";
import { getCachedVehicleSearchPrice } from "@/lib/search-pricing";

export const metadata: Metadata = {
  title: "Browse Vehicles",
  description: "Browse our full fleet of self-drive bikes, scooters and cars with fixed, transparent pricing.",
};
export const revalidate = 60;

const FLEET_VIDEO = "https://videos.pexels.com/video-files/5061405/5061405-sd_640_360_30fps.mp4";

export default async function VehiclesPage(
  props: { searchParams: Promise<{ kind?: string; pickup?: string; pickupTime?: string; return?: string; returnTime?: string }> }
) {
  const searchParams = await props.searchParams;
  const kind = searchParams.kind;
  const pickupDate = searchParams.pickup;
  const pickupTime = searchParams.pickupTime || "08:00";
  const returnDate = searchParams.return;
  const returnTime = searchParams.returnTime || "08:00";

  const [categories, vehicles] = await Promise.all([
    getVehicleCategories(),
    getVehicles({ kind: kind || undefined }),
  ]);

  // Compute temporary Redis-cached search prices for all vehicles if dates were provided
  const hasSearchQuery = Boolean(pickupDate && returnDate);
  const searchQuotes = hasSearchQuery
    ? await Promise.all(
        vehicles.map((v) => getCachedVehicleSearchPrice(v, pickupDate, pickupTime, returnDate, returnTime))
      )
    : [];

  const queryParamsStr = new URLSearchParams();
  if (kind) queryParamsStr.set("kind", kind);
  if (pickupDate) queryParamsStr.set("pickup", pickupDate);
  if (pickupTime) queryParamsStr.set("pickupTime", pickupTime);
  if (returnDate) queryParamsStr.set("return", returnDate);
  if (returnTime) queryParamsStr.set("returnTime", returnTime);
  const queryString = queryParamsStr.toString() ? `?${queryParamsStr.toString()}` : "";

  return (
    <>
      <section className="grain relative -mt-20 sm:-mt-24 overflow-hidden border-b border-ink-100 bg-ink-950 pt-20 sm:pt-24 text-white">
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

      {/* Interactive Search Bar Section */}
      <section className="relative z-30 -mt-6 sm:-mt-8 mb-8 container-x">
        <BookingBar categories={categories} initialValues={{ kind, pickup: pickupDate, pickupTime, return: returnDate, returnTime }} />
      </section>

      <section className="container-x pb-16">
        {/* Search Pricing Notification Banner */}
        {hasSearchQuery && searchQuotes[0] && (
          <div className="mb-6 rounded-2xl border border-brand-300 bg-brand-50/90 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-brand-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink-950">
                  Trip Pricing
                </span>
                <span className="text-sm font-bold text-ink-900">
                  {searchQuotes[0].days} Day{searchQuotes[0].days > 1 ? "s" : ""} Duration
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-700">
                Calculated for {formatDate(pickupDate)} ({pickupTime}) → {formatDate(returnDate)} ({returnTime}).
                {searchQuotes[0].weekendDaysCount > 0 && ` Includes weekend dynamic rates (+₹50).`}
              </p>
            </div>
            <Link
              href="/vehicles"
              className="text-xs font-semibold text-brand-800 underline hover:text-brand-950 self-start sm:self-auto"
            >
              Reset to regular prices
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/vehicles${pickupDate ? `?pickup=${pickupDate}&pickupTime=${pickupTime}&return=${returnDate}&returnTime=${returnTime}` : ""}`}
            className={`badge ring-1 ring-inset transition ${!kind ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-white text-ink-600 ring-ink-200 hover:border-brand-400"}`}
          >
            All
          </Link>
          {Array.from(new Map(categories.map((c) => [c.kind, c])).values()).map((c) => {
            const catParams = new URLSearchParams();
            catParams.set("kind", c.kind);
            if (pickupDate) catParams.set("pickup", pickupDate);
            if (pickupTime) catParams.set("pickupTime", pickupTime);
            if (returnDate) catParams.set("return", returnDate);
            if (returnTime) catParams.set("returnTime", returnTime);

            return (
              <Link
                key={c.kind}
                href={`/vehicles?${catParams.toString()}`}
                className={`badge ring-1 ring-inset transition ${kind === c.kind ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-white text-ink-600 ring-ink-200 hover:border-brand-400"}`}
              >
                {c.icon && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={c.icon} /></svg>}
                {c.name}
              </Link>
            );
          })}
        </div>

        {vehicles.length === 0 ? (
          <div className="mt-8"><EmptyState title="No vehicles found" body="Try a different vehicle type or dates." /></div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v, i) => {
              const isOutOfStock = (v.available_units ?? v.total_units ?? 0) <= 0;
              const weekendActive = isWeekend();
              const quote = searchQuotes[i];

              const bookingParams = queryParamsStr.toString() ? `&${queryParamsStr.toString()}` : "";
              const cardHref = hasSearchQuery
                ? `/booking?vehicle=${v.id}${bookingParams}&step=3`
                : `/vehicles/${v.slug}${queryString}`;

              return (
                <Reveal key={v.id} delay={(i % 6) * 60}>
                  <Link
                    href={cardHref}
                    className={`group card block overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift ${isOutOfStock ? "opacity-85" : ""}`}
                  >
                    <div className="relative h-44 overflow-hidden bg-ink-100">
                      {v.primary_photo && <Image src={v.primary_photo} alt={v.name} fill loading="lazy" className="object-contain p-4 transition-transform duration-500 group-hover:scale-110" sizes="(max-width:768px) 100vw, 33vw" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/50 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
                      <span className="absolute left-3 top-3 badge bg-white/95 text-ink-800 shadow-sm">{v.category_name}</span>
                      <span className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md ${isOutOfStock ? "bg-rose-600 text-white" : (v.available_units ?? v.total_units) <= 1 ? "bg-amber-500 text-ink-950" : "bg-ink-950/90 text-brand-300 backdrop-blur-sm"}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        {isOutOfStock ? "Out of Stock" : `${v.available_units ?? v.total_units} Left`}
                      </span>
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-lg font-semibold text-ink-900">{v.name}</h3>
                        {quote && quote.weekendDaysCount > 0 ? (
                          <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                            +₹50 Weekend
                          </span>
                        ) : weekendActive && !quote ? (
                          <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                            +₹50 Weekend
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-500">{v.fuel_type} · {v.seats} seats · {v.included_km >= 999 ? "Unlimited KM" : `${v.included_km} km/day`}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                        {formatINR(v.deposit)} refundable deposit
                      </p>

                      <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                        <div>
                          {quote ? (
                            <div>
                              <p className="text-sm text-ink-500">
                                <span className="font-display text-xl font-bold text-ink-900">{formatINR(quote.baseAmount)}</span>
                                <span className="text-xs"> for {quote.days} day{quote.days > 1 ? "s" : ""}</span>
                              </p>
                              <p className="text-[11px] text-ink-500 font-medium">
                                Total: {formatINR(quote.totalAmount)} (incl. GST &amp; Deposit)
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-ink-500">
                              <span className="font-display text-xl font-semibold text-ink-900">{formatINR(v.rate_24h)}</span>
                              <span className="text-xs">/24h</span>
                            </p>
                          )}
                        </div>

                        <span className={`flex items-center gap-1 text-sm font-semibold transition group-hover:gap-2 ${isOutOfStock ? "text-rose-600" : "text-brand-700"}`}>
                          {isOutOfStock ? "Out of Stock" : quote ? "Book Now" : "View"}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

