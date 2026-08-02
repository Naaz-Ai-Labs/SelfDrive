import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { businessInfo } from "@/lib/settings";
import { getGallery, getStaff, getTestimonials } from "@/lib/data";
import { SectionHeading, Stars, Avatar } from "@/components/ui";

export const metadata: Metadata = {
  title: "About Us",
  description: "Darshh Holiday — a Hassan district self-drive rental operator serving Hassan and Sakleshpura, built on fixed pricing, well-maintained vehicles and no bargaining.",
};

const HERO_VIDEO = "https://videos.pexels.com/video-files/6981411/6981411-hd_1280_720_25fps.mp4";

export default async function AboutPage() {
  const [info, galleryAll, staffAll, testimonials] = await Promise.all([
    businessInfo(), getGallery(), getStaff(), getTestimonials(),
  ]);
  const gallery = galleryAll.slice(0, 5);
  const staff = staffAll.filter((s) => s.is_active).slice(0, 4);
  const avgRating =
    testimonials.length > 0
      ? Math.round((testimonials.reduce((s, t) => s + Number(t.rating), 0) / testimonials.length) * 10) / 10
      : 0;

  const values = [
    {
      title: "Fixed pricing, always",
      body: "The rate you see is the rate you pay. No bargaining, no last-minute add-ons at the counter.",
    },
    {
      title: "Well maintained fleet",
      body: "Every vehicle is inspected and serviced before it's handed over — fitness, tyres and cleanliness, checked.",
    },
    {
      title: "One point of contact",
      body: "The team that confirms your booking is the team that hands you the keys. No call centres, no run-around.",
    },
    {
      title: "Clear, upfront terms",
      body: "Deposit, kilometre allowance and late fees are shown before you book — not discovered afterwards.",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative isolate -mt-16 overflow-hidden bg-ink-950 pt-16 text-white">
        <video
          className="hero-video absolute inset-0 h-full w-full object-cover opacity-90"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          aria-hidden
          tabIndex={-1}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/45 via-ink-950/35 to-ink-950/85" aria-hidden />
        <div className="container-x relative flex min-h-[62vh] flex-col justify-center py-28">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-brand-400">Our story</p>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-medium leading-[1.08] sm:text-5xl lg:text-6xl">
            Fixed rental. This is not a negotiation.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            {String(info.name ?? "Darshh Holiday")} is a Hassan district self-drive rental operator serving Hassan
            and Sakleshpura — bikes, scooters, cars and a chauffeur-driven tempo traveller for group sightseeing,
            all on one fixed price list.
          </p>
          <dl className="mt-12 flex flex-wrap gap-4">
            {[
              { label: "Happy clients", value: "150+" },
              { label: "Fleet size", value: "20+" },
              { label: "Trips completed", value: "100+" },
              { label: "Rider rating", value: avgRating > 0 ? `${avgRating} ★` : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/15 bg-white/10 px-6 py-4 backdrop-blur-xl">
                <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">{s.label}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold text-brand-400">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Story + promise */}
      <section className="container-x py-20 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="space-y-6 text-base leading-relaxed text-ink-700">
            <p className="font-display text-2xl font-medium leading-snug text-ink-900">
              Ride more, explore more — without haggling over the price first.
            </p>
            <p>
              We started renting a handful of cars to travellers passing through Sakleshpura on their way to
              Chikmagalur and the Western Ghats. What made people come back wasn't the vehicles alone — it was
              knowing exactly what they'd pay before they picked up the keys.
            </p>
            <p>
              Today our fleet covers bikes, scooters, hatchbacks, sedans, SUVs and a tempo traveller for group
              sightseeing days — but the promise hasn't changed. One fixed price list. No bargaining, ever.
            </p>
            <p>
              We remain deliberately hands-on. The team that inspects your vehicle at handover is the same team you
              call if anything comes up on the road.
            </p>
          </div>
          <div className="space-y-4">
            <div className="card p-7">
              <h2 className="font-display text-xl font-semibold text-ink-900">What we promise</h2>
              <ul className="mt-5 space-y-3.5 text-sm text-ink-700">
                {[
                  "Fixed pricing with no bargaining, ever",
                  "Well-maintained, inspected vehicles",
                  "Clear deposit, km allowance and late-fee terms upfront",
                  "A single point of contact from booking to return",
                  "Honest advice — including when a vehicle isn't right for your trip",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-600" aria-hidden>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card overflow-hidden bg-ink-950 p-7 text-white">
              <h2 className="font-display text-xl font-semibold">Book your ride</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Search your dates, pick a vehicle, and see the full price before you commit.
              </p>
              <Link href="/booking" className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-ink-950 transition hover:bg-brand-400 active:scale-[0.98]">
                Start booking
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-brand-50/70 py-20 sm:py-24">
        <div className="container-x">
          <SectionHeading center eyebrow="How we work" title="Four principles behind every rental" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((item) => (
              <div key={item.title} className="card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 font-display text-lg font-bold text-brand-600" aria-hidden>
                  {item.title.slice(0, 1)}
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      {staff.length > 0 && (
        <section className="container-x py-20 sm:py-24">
          <SectionHeading eyebrow="The people you'll talk to" title="A small team, present from booking to return" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {staff.map((member) => (
              <div key={member.id} className="card flex items-center gap-4 p-5">
                <Avatar name={member.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold text-ink-900">{member.name}</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-brand-600">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery strip */}
      {gallery.length > 0 && (
        <section className="pb-20 sm:pb-24">
          <div className="container-x">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <SectionHeading eyebrow="From the road" title="Moments from recent rentals" />
              <Link href="/gallery" className="btn-secondary shrink-0">View gallery</Link>
            </div>
          </div>
          <div className="mt-10 flex gap-4 overflow-x-auto px-4 pb-2 sm:container-x sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-8">
            {gallery.map((item) => (
              <div key={Number(item.id)} className="relative aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-2xl shadow-soft sm:w-auto">
                <Image src={String(item.image)} alt={String(item.title ?? "Rental moment")} fill loading="lazy" className="object-cover transition duration-500 hover:scale-105" sizes="(max-width: 768px) 40vw, 20vw" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-x pb-20 sm:pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-ink-950 px-6 py-14 text-center text-white sm:px-12">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-500/25" aria-hidden />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 bg-bblue-500/20" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Ready to book your ride?</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Pick your dates and vehicle — we'll have it ready and waiting, with no surprises at the counter.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/booking" className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-4 text-sm font-bold uppercase tracking-wider text-ink-950 shadow-lift transition hover:bg-brand-400 active:scale-[0.98]">
                Book now
              </Link>
              <Link href="/vehicles" className="btn bg-white/10 px-8 py-4 text-base text-white ring-1 ring-white/30 hover:bg-white/20">
                Browse the fleet
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
