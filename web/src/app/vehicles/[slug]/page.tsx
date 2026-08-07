import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getVehicle, getVehicles } from "@/lib/data";
import { getActiveTermsVersion } from "@/lib/data";
import { formatINR, waLink } from "@/lib/utils";
import { businessInfo } from "@/lib/settings";
import { Reveal } from "@/components/ui/Reveal";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const vehicle = await getVehicle(params.slug);
  if (!vehicle) return { title: "Vehicle not found" };
  return {
    title: vehicle.name,
    description: `Rent the ${vehicle.name} — ${formatINR(vehicle.rate_24h)}/24h, ${vehicle.included_km} km included, ₹${vehicle.deposit} deposit. Fixed pricing, no bargaining.`,
    alternates: { canonical: `/vehicles/${vehicle.slug}` },
    openGraph: vehicle.primary_photo ? { images: [{ url: vehicle.primary_photo }] } : undefined,
  };
}

export const revalidate = 60;

const SPEC_ICONS: Record<string, string> = {
  brand: "M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z",
  year: "M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  fuel: "M6 3h8v9a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3zM17 8h1a2 2 0 012 2v5a1.5 1.5 0 01-3 0V9",
  transmission: "M4 12h4l2-4 4 8 2-4h4",
  seats: "M5 11V6a2 2 0 012-2h6a2 2 0 012 2v5M4 11h16v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM6 20v-3M18 20v-3",
  mileage: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  km: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  extraKm: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  deposit: "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4 1.3 4 3-1.8 3-4 3m0-12V5m0 14v-2M12 3v18",
};

function SpecIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default async function VehicleDetailPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ pickup?: string; return?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const vehicle = await getVehicle(params.slug);
  if (!vehicle) notFound();
  const [similarAll, terms, info] = await Promise.all([
    getVehicles({ categorySlug: vehicle.category_slug ?? undefined }),
    getActiveTermsVersion(),
    businessInfo(),
  ]);
  const similar = similarAll.filter((v) => v.id !== vehicle.id).slice(0, 3);

  const bookingHref = `/booking?vehicle=${vehicle.id}${searchParams.pickup ? `&pickup=${searchParams.pickup}` : ""}${searchParams.return ? `&return=${searchParams.return}` : ""}`;

  const specs: Array<[string, string | number, string]> = [
    ["Brand / model", `${vehicle.brand} ${vehicle.model}`, SPEC_ICONS.brand],
    ["Year", vehicle.year ?? "—", SPEC_ICONS.year],
    ["Fleet count", `${vehicle.total_units ?? 1} available`, SPEC_ICONS.brand],
    ["Fuel", vehicle.fuel_type, SPEC_ICONS.fuel],
    ["Transmission", vehicle.transmission, SPEC_ICONS.transmission],
    ["Seats", vehicle.seats, SPEC_ICONS.seats],
    ["Mileage", vehicle.mileage ?? "—", SPEC_ICONS.mileage],
    ["Included km/day", vehicle.included_km >= 999 ? "Unlimited KM" : `${vehicle.included_km} km`, SPEC_ICONS.km],
    ["Extra km rate", formatINR(vehicle.extra_km_rate), SPEC_ICONS.extraKm],
    ["Security deposit", formatINR(vehicle.deposit), SPEC_ICONS.deposit],
  ];

  const siteUrl = "https://darshhrentals.in";
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vehicle.name,
    description: vehicle.description ?? `${vehicle.brand} ${vehicle.model} self-drive rental in ${String(info.city ?? "Hassan")}.`,
    brand: { "@type": "Brand", name: vehicle.brand },
    image: vehicle.primary_photo ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: vehicle.rate_24h,
      availability: vehicle.status === "available" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${siteUrl}/vehicles/${vehicle.slug}`,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Vehicles", item: `${siteUrl}/vehicles` },
      { "@type": "ListItem", position: 3, name: vehicle.name, item: `${siteUrl}/vehicles/${vehicle.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <section className="container-x py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-ink-400">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="hover:text-brand-700">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/vehicles" className="hover:text-brand-700">Vehicles</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink-600">{vehicle.name}</li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-ink-100 shadow-soft">
              {vehicle.primary_photo && <Image src={vehicle.primary_photo} alt={vehicle.name} fill priority className="object-contain p-6" sizes="(max-width:1024px) 100vw, 60vw" />}
              <span className="absolute left-4 top-4 badge bg-white/95 text-ink-800 shadow-sm">{vehicle.category_name}</span>
              <span className={`absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-md ${(vehicle.available_units ?? vehicle.total_units) <= 1 ? "bg-amber-500 text-ink-950" : "bg-ink-950/90 text-brand-300 backdrop-blur-md"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                {(vehicle.available_units ?? vehicle.total_units ?? 1) > 0 ? `${vehicle.available_units ?? vehicle.total_units} Left` : "Pending Approval"}
              </span>
            </div>
            {vehicle.photos.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-3">
                {vehicle.photos.slice(1, 5).map((p) => (
                  <div key={p} className="relative aspect-square overflow-hidden rounded-xl bg-ink-100">
                    <Image src={p} alt="" fill className="object-cover" sizes="120px" />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{vehicle.category_name}</p>
              <h1 className="mt-2 font-display text-3xl font-black text-ink-900 sm:text-4xl">{vehicle.name}</h1>
              <p className="mt-3 text-base leading-relaxed text-ink-600">{vehicle.description}</p>

              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {specs.map(([label, value, icon]) => (
                  <div key={String(label)} className="card flex flex-col items-center gap-1.5 p-4 text-center transition hover:border-brand-300">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-600"><SpecIcon d={icon} /></span>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</dt>
                    <dd className="text-sm font-semibold text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {vehicle.terms && (
                <div className="mt-8 card p-5">
                  <h2 className="font-display text-base font-semibold text-ink-900">Vehicle terms</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{vehicle.terms}</p>
                </div>
              )}

              {terms && (
                <div className="mt-4 card p-5">
                  <h2 className="font-display text-base font-semibold text-ink-900">Required documents &amp; policy</h2>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
                    {terms.content.slice(0, 6).map((t) => (
                      <li key={t} className="flex gap-2"><span className="text-brand-600" aria-hidden>✓</span>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="card relative overflow-hidden p-6">
              <div className="absolute inset-x-0 top-0 h-2 bg-brand-500" aria-hidden />
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Pricing</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-3xl font-black text-ink-900">{formatINR(vehicle.rate_24h)}</span>
                <span className="pb-1 text-sm text-ink-500">/ 24 hours</span>
              </div>
              {vehicle.rate_12h > 0 && <p className="mt-1 text-sm text-ink-500">{formatINR(vehicle.rate_12h)} for up to 12 hours</p>}
              <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm text-ink-600">
                <li className="flex justify-between font-semibold text-brand-700"><span>Fleet stock</span><span>{vehicle.total_units ?? 1} available</span></li>
                <li className="flex justify-between"><span>Included km</span><span className="font-medium text-ink-800">{vehicle.included_km >= 999 ? "Unlimited KM" : `${vehicle.included_km} km/day`}</span></li>
                <li className="flex justify-between"><span>Extra km rate</span><span className="font-medium text-ink-800">{formatINR((vehicle.category_kind === "bike" || vehicle.category_kind === "scooter") ? 4 : vehicle.extra_km_rate ?? 8)}/km</span></li>
                <li className="flex justify-between"><span>Security deposit</span><span className="font-medium text-ink-800">{formatINR(vehicle.deposit)}</span></li>
              </ul>
              <p className="mt-4 text-xs text-ink-500">Fixed rental — no bargaining. Vehicle rented without fuel; return with the same fuel level. GST (6%) added at checkout.</p>
              <Link href={bookingHref} className="btn-shine mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98]">
                Book this vehicle
              </Link>
              <a href={waLink(String(info.whatsapp ?? ""), `Hi, I'd like to enquire about the ${vehicle.name}`)} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-2 w-full">
                WhatsApp enquiry
              </a>
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <Reveal>
            <div className="mt-16">
              <h2 className="font-display text-xl font-semibold text-ink-900">More in {vehicle.category_name}</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                {similar.map((v) => (
                  <Link key={v.id} href={`/vehicles/${v.slug}`} className="card overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                    {v.primary_photo && (
                      <div className="relative h-32 overflow-hidden bg-ink-100">
                        <Image src={v.primary_photo} alt={v.name} fill className="object-contain p-3" sizes="240px" />
                      </div>
                    )}
                    <div className="p-5">
                      <p className="font-display text-base font-semibold text-ink-900">{v.name}</p>
                      <p className="mt-1 text-sm text-ink-500">{formatINR(v.rate_24h)}/24h</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        )}
      </section>

      {/* Mobile-only sticky booking bar — the sidebar CTA is only sticky at lg+,
          so without this, phone users have to scroll past everything to book. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 p-3 backdrop-blur-md [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-none text-ink-900">{formatINR(vehicle.rate_24h)}</p>
            <p className="text-[11px] text-ink-500">/ 24 hours</p>
          </div>
          <Link href={bookingHref} className="btn-shine ml-auto flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold uppercase tracking-wide text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98]">
            Book this vehicle
          </Link>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </>
  );
}
