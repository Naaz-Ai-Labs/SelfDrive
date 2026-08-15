import Link from "next/link";
import Image from "next/image";
import { getVehicleCategories, getVehicles, getTestimonials, getFaqs } from "@/lib/data";
import { formatINR } from "@/lib/utils";
import { SectionHeading, Stars } from "@/components/ui";
import { BookingBar } from "@/components/BookingBar";
import { Reveal } from "@/components/ui/Reveal";
import { Marquee } from "@/components/ui/Marquee";
import { OurStories } from "@/components/OurStories";

const HERO_IMG = "/hero-poster.jpg";
const HERO_VIDEO = process.env.NEXT_PUBLIC_BLOB_HERO_VIDEO || null;


const SPEC_ICONS: Record<string, string> = {
  transmission: "M4 12h4l2-4 4 8 2-4h4",
  fuel: "M6 3h8v9a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3zM17 8h1a2 2 0 012 2v5a1.5 1.5 0 01-3 0V9",
  seats: "M5 11V6a2 2 0 012-2h6a2 2 0 012 2v5M4 11h16v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM6 20v-3M18 20v-3",
  km: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function SpecIcon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const revalidate = 60;

export default async function HomePage() {
  const [categories, vehicles, testimonials, faqsAll] = await Promise.all([
    getVehicleCategories(),
    getVehicles(),
    getTestimonials(),
    getFaqs(),
  ]);
  const faqs = faqsAll.slice(0, 6);
  const avgRating =
    testimonials.length > 0
      ? Math.round((testimonials.reduce((s, t) => s + Number(t.rating), 0) / testimonials.length) * 10) / 10
      : 0;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: String(f.question),
      acceptedAnswer: { "@type": "Answer", text: String(f.answer) },
    })),
  };

  return (
    <>
      {faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      {/* Hero — the video is the actual background now, not a boxed-in card,
          so the whole section reads as one composition instead of text next
          to a video. A static poster paints instantly; the video swaps in
          once it can play, and never loads at all if the visitor has
          prefers-reduced-motion set. */}
      <section className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-ink-950 -mt-20 sm:-mt-24 pt-20 sm:pt-24 text-white">
        <Image src={HERO_IMG} alt="" aria-hidden fill priority className="object-cover" sizes="100vw" />
        {HERO_VIDEO && (
          <video
            className="hero-video absolute inset-0 h-full w-full object-cover brightness-125 contrast-105"
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            preload="auto"
            poster={HERO_IMG}
            aria-hidden
            tabIndex={-1}
          >
            <source src={HERO_VIDEO} type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/25" aria-hidden />

        <div className="container-x relative z-10 flex flex-1 flex-col justify-center items-center text-center py-12 sm:py-16">
          <div className="max-w-3xl mx-auto flex flex-col items-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.28em] text-brand-300 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden />
              Fixed pricing · No bargaining
            </span>
            <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Rent the{" "}
              <span className="relative inline-block text-brand-400">
                Right Ride
                <svg className="absolute -bottom-1.5 left-0 w-full text-brand-500/70" height="8" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 6 Q50 -2 100 6 T200 6" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>{" "}
              for Every Journey
            </h1>
            <p className="mt-5 max-w-xl mx-auto text-base leading-relaxed text-white/90 sm:text-lg sm:leading-relaxed">
              Self-drive bike, scooter and car rental for the Hassan–Sakleshpura–Chikmagalur stretch — one price list,
              no haggling at the counter, and a vehicle that's actually been checked before you get the keys.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:-translate-x-5">
              <Link
                href="/booking"
                className="btn-shine inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-brand-500 px-7 text-sm font-bold leading-none text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span>Search Available Vehicles</span>
              </Link>
              <Link
                href="/vehicles"
                className="inline-flex h-12 items-center justify-center gap-2.5 rounded-full border border-white/25 bg-white/10 px-7 text-sm font-bold leading-none text-white backdrop-blur-md transition hover:border-brand-400/50 hover:bg-white/20 active:scale-[0.98]"
              >
                <span>Browse Our Fleet</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>

            {avgRating > 0 && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-ink-950/60 px-5 py-2.5 shadow-soft backdrop-blur-xl">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-xs font-black text-ink-950 shadow-sm">
                  {avgRating}
                </div>
                <div className="text-left">
                  <Stars rating={Math.round(avgRating)} />
                  <p className="text-[11px] font-medium text-white/80">{testimonials.length}+ verified rider reviews</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Booking Bar Section (Positioned Cleanly Below Video) */}
      <section className="relative z-30 mt-4 sm:mt-6 mb-10">
        <div className="container-x">
          <BookingBar categories={categories} />
        </div>
      </section>

      <Marquee items={["Fixed pricing", "No bargaining", "Well maintained fleet", "Refundable deposit", "24×7 support", "Hassan & Sakleshpura"]} />

      {/* Browse by vehicle type */}
      <section className="container-x py-20 sm:py-24" aria-labelledby="categories-heading">
        <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            eyebrow="Browse by vehicle type"
            title="What are you riding today?"
            subtitle="Pick a category to see live availability, specs and the full price breakdown before you book."
          />
          <Link href="/vehicles" className="btn-secondary shrink-0">View all vehicles</Link>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" id="categories-heading">
          {categories.map((cat, i) => (
            <Reveal key={cat.id} delay={i * 80} className="h-full">
              <Link
                href={`/vehicles?kind=${cat.kind}`}
                className="group card flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift"
              >
                <div className="relative h-40 shrink-0 overflow-hidden">
                  <Image
                    src={cat.image ?? HERO_IMG}
                    alt={cat.name}
                    fill
                    loading="lazy"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent" aria-hidden />
                  <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-900">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={cat.icon ?? ""} /></svg>
                  </span>
                  <h3 className="absolute bottom-4 left-5 font-display text-lg font-semibold text-white">{cat.name}</h3>
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <p className="text-sm leading-relaxed text-ink-600">{cat.short_desc}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition group-hover:gap-2.5">
                    View {cat.name.toLowerCase()}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Featured vehicles */}
      <section className="grain bg-ink-950 py-20 text-white sm:py-24">
        <div className="container-x">
          <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-400">Popular right now</p>
              <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Featured vehicles</h2>
            </div>
            <Link href="/vehicles" className="btn shrink-0 bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20">
              All vehicles
            </Link>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vehicles.slice(0, 6).map((v, i) => {
              // Same server-computed availability the listing page uses. Nothing is
              // recalculated here.
              const isOutOfStock =
                (v.available_units ?? v.total_units ?? 0) <= 0 ||
                (v.status ? v.status !== "available" : false);
              return (
              <Reveal key={v.id} delay={i * 70}>
                <Link
                  href={`/vehicles/${v.slug}`}
                  aria-label={isOutOfStock ? `${v.name} — currently unavailable` : v.name}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-soft transition ${
                    isOutOfStock
                      ? "opacity-60 saturate-0"
                      : "hover:-translate-y-1 hover:border-brand-400/50 hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="absolute right-5 top-5 font-display text-4xl font-black text-white/5">{String(i + 1).padStart(2, "0")}</span>
                  {v.primary_photo && (
                    <div className="relative -mx-6 -mt-6 mb-5 h-36 overflow-hidden bg-white/95">
                      <Image src={v.primary_photo} alt={`${v.name} self-drive rental in Hassan & Sakleshpura`} fill loading="lazy" className={`object-contain p-4 transition-transform duration-500 ${isOutOfStock ? "" : "group-hover:scale-105"}`} sizes="(max-width: 768px) 100vw, 33vw" />
                      {/* "Pending Approval" was shown at zero stock — that is a CRM
                          workflow term, not something a customer can act on. */}
                      <span className={`absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md ${isOutOfStock ? "bg-ink-700 text-white" : (v.available_units ?? v.total_units) <= 1 ? "bg-amber-500 text-ink-950" : "bg-ink-950/90 text-brand-300 backdrop-blur-sm"}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        {isOutOfStock ? "Out of Stock" : `${v.available_units ?? v.total_units} Left`}
                      </span>
                    </div>
                  )}
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-400/90">{v.category_name}</p>
                  <h3 className="mt-2 font-display text-xl font-semibold">{v.name}</h3>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-300/80">
                    <span className="flex items-center gap-1.5"><SpecIcon d={SPEC_ICONS.transmission} />{v.transmission}</span>
                    <span className="flex items-center gap-1.5"><SpecIcon d={SPEC_ICONS.fuel} />{v.fuel_type}</span>
                    <span className="flex items-center gap-1.5"><SpecIcon d={SPEC_ICONS.seats} />{v.seats} seats</span>
                    <span className="flex items-center gap-1.5"><SpecIcon d={SPEC_ICONS.km} />{v.included_km >= 999 ? "Unlimited KM" : `${v.included_km} km/day`}</span>
                  </div>
                  <div className="mt-6 flex flex-1 items-end justify-between border-t border-white/10 pt-4">
                    <p className="text-sm text-ink-200/70">
                      <span className="font-display text-xl font-semibold text-brand-400">{formatINR(v.rate_24h)}</span>
                      <span className="text-xs">/24h</span>
                    </p>
                    {isOutOfStock ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-ink-300">
                        Out of Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-ink-950 transition group-hover:bg-brand-400 group-hover:gap-3">
                        View &amp; book
                      </span>
                    )}
                  </div>
                </Link>
              </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* About Us & Rider Stories Section */}
      <OurStories />

      {/* Why choose us — bento layout */}
      <section className="container-x py-20 sm:py-24">
        <Reveal>
          <SectionHeading
            center
            eyebrow="Why choose us"
            title="Fixed rental. This is not a negotiation."
            subtitle="No bargaining, no hidden fees — every price you see is the price you pay."
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <div className="relative h-full min-h-[280px] overflow-hidden rounded-3xl bg-ink-950 p-8 text-white">
              <Image src="/vehicles/mahindra-thar.avif" alt="" fill className="object-cover opacity-40" sizes="60vw" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 font-display text-lg font-black text-ink-950" aria-hidden>₹</div>
                <div>
                  <h3 className="font-display text-2xl font-semibold">Fixed, transparent pricing</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">
                    Every vehicle shows its price, deposit, km limit and late fee upfront. No last-minute surprises,
                    no bargaining, no counter tricks — the price on the listing is the price you pay.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
          <div className="grid gap-5">
            {[
              { icon: "M14.7 6.3a1 1 0 010 1.4l-1.6 1.6a3 3 0 11-4.4-4.4l1.6-1.6a1 1 0 011.4 0l3 3zM4 20l6-6M9 15l-5 5", title: "Checked before every handover", body: "Tyres, brakes and fluids go through the same inspection sheet every time — not just when something's already wrong." },
              { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4", title: "Licence and ID, verified once", body: "We check your documents at pickup so there's no back-and-forth mid-trip if you get stopped." },
            ].map((item) => (
              <Reveal key={item.title}>
                <div className="card h-full p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-brand-700" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-ink-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="lg:col-span-3">
            <div className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-ink-900">Simple deposit &amp; km rules</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">A refundable security deposit and a clear per-km rate beyond your included allowance — nothing hidden.</p>
              </div>
              <Link href="/terms" className="btn-secondary shrink-0">Read the terms</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works + pricing explanation */}
      <section className="relative overflow-hidden bg-brand-50/70 py-20">
        <div className="container-x">
          <Reveal><SectionHeading center eyebrow="How booking works" title="From search to the open road in three steps" /></Reveal>
          <div className="relative mx-auto mt-16 max-w-4xl">
            {/* Connector line running through the centre of each node — only
                meaningful once there's more than one column, so desktop-only.
                A travelling pulse loops along it so the diagram reads as an
                active process, not just a static route map. */}
            <div className="absolute top-8 hidden h-0.5 overflow-hidden bg-brand-300/60 sm:block" style={{ left: "16.6667%", right: "16.6667%" }} aria-hidden>
              <span className="workflow-pulse absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
            </div>
            <div className="absolute top-8 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-brand-500 shadow-[0_0_10px_2px_rgba(190,81,3,0.6)] sm:block workflow-runner" style={{ left: "16.6667%" }} aria-hidden />
            <ol className="relative grid gap-10 sm:grid-cols-3">
              {[
                { n: "01", t: "Pick your dates & vehicle", b: "Search by pickup and return date and time, compare specs and see the full price before you commit." },
                { n: "02", t: "Book & verify documents", b: "Share your details and driving licence, accept the terms, and pay online — advance or full, your choice." },
                { n: "03", t: "Pickup, ride, return", b: "We inspect the vehicle together at handover and return — clear photos, clear numbers, no disputes." },
              ].map((s, i, arr) => (
                <Reveal key={s.n} delay={i * 100}>
                  <li className="relative flex flex-col items-center text-center">
                    <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 bg-white font-display text-lg font-black text-brand-600 shadow-soft">
                      {s.n}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="absolute left-1/2 top-6 z-10 hidden translate-x-[2.75rem] items-center justify-center rounded-full bg-brand-50 text-brand-500 sm:flex" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    )}
                    <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">{s.t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.b}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal>
            <div className="card mx-auto mt-14 max-w-3xl p-6 text-sm text-ink-600">
              <p className="font-display text-base font-semibold text-ink-900">Standard rental period &amp; documents</p>
              <p className="mt-2 leading-relaxed">
                A standard rental runs 24 hours from your pickup time (with a shorter-duration rate available on select
                vehicles), and includes a fixed kilometre allowance shown on each vehicle. Bring a valid driving licence
                and a government photo ID at pickup — vehicles are rented without fuel, so please return with the same
                fuel level you received it at.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="container-x py-20 sm:py-24">
          <Reveal><SectionHeading center eyebrow="Word of mouth" title="Riders keep coming back" /></Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {testimonials.slice(0, 3).map((t, i) => (
              <Reveal key={Number(t.id)} delay={i * 90} className={i === 1 ? "md:mt-8" : ""}>
                <figure className="card flex h-full flex-col p-6">
                  <span className="font-display text-4xl leading-none text-brand-500/25" aria-hidden>&ldquo;</span>
                  <Stars rating={Number(t.rating)} className="mt-1" />
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-700">
                    {String(t.quote)}
                  </blockquote>
                  <figcaption className="mt-5 border-t border-ink-100 pt-4">
                    <p className="text-sm font-semibold text-ink-900">{String(t.name)}</p>
                    <p className="text-xs text-ink-500">{String(t.vehicle ?? "")}{t.location ? ` · ${String(t.location)}` : ""}</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="container-x py-20 sm:pb-24">
          <div className="mx-auto max-w-3xl">
            <Reveal><SectionHeading center eyebrow="Common questions" title="Everything you might ask" /></Reveal>
            <Reveal>
              <div className="card mt-10 divide-y divide-ink-100">
                {faqs.map((f) => (
                  <details key={Number(f.id)} className="group px-6 py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                      {String(f.question)}
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 transition group-open:rotate-45" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-ink-600">{String(f.answer)}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-x pb-20 sm:pb-24">
        <Reveal>
          <div className="grain relative overflow-hidden border-2 border-ink-950 bg-ink-950 px-6 py-16 text-center text-white sm:px-12">
            <Image src="/vehicles/cta-tempo-banner.jpg" alt="" aria-hidden fill className="object-cover object-center opacity-85" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/65 to-ink-950/45" aria-hidden />
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-500/25" aria-hidden />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 bg-bblue-500/20" aria-hidden />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">Ready to hit the road?</h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                Pre-booking only — search your dates, lock in your vehicle, and we&apos;ll have it ready for pickup.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/booking" className="btn-shine inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-4 text-sm font-bold uppercase tracking-wider text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98]">
                  Book now
                </Link>
                <a
                  href="https://wa.me/917676875595?text=Hi%2C%20I%20would%20like%20to%20book%20a%20vehicle"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-white/10 px-8 py-4 text-base text-white ring-1 ring-white/30 hover:bg-white/20"
                >
                  WhatsApp us instead
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
