import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getGallery, getVehicles } from "@/lib/data";
import { SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Gallery — Rides We've Delivered",
  description: "Moments from self-drive rentals and group sightseeing trips arranged by Darshh Holiday.",
};

const FALLBACK =
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80";

export default async function GalleryPage() {
  const [items, vehicles] = await Promise.all([getGallery(), getVehicles()]);
  const fleet = vehicles.filter((v) => v.primary_photo);
  const row1 = fleet.filter((_, i) => i % 2 === 0);
  const row2 = fleet.filter((_, i) => i % 2 === 1);

  return (
    <>
      <section className="border-b border-ink-100 bg-brand-600/5">
        <div className="container-x py-16 sm:py-20">
          <SectionHeading
            eyebrow="Gallery"
            title="Rides we have delivered"
            subtitle="A few moments from our fleet and customer trips. (Replace these with your own photos from the admin panel.)"
          />
        </div>
      </section>

      {fleet.length > 0 && (
        <section className="border-b border-ink-100 bg-ink-950 py-14 text-white">
          <div className="container-x mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-400">The full fleet</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Every vehicle, drifting by</h2>
          </div>
          <div className="space-y-5 overflow-hidden">
            <div className="fleet-track">
              {[...row1, ...row1].map((v, i) => (
                <Link
                  key={`${v.id}-${i}`}
                  href={`/vehicles/${v.slug}`}
                  className="group relative mx-2.5 h-48 w-64 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/95"
                >
                  <Image src={v.primary_photo as string} alt={v.name} fill loading="lazy" className="object-contain p-4 transition-transform duration-500 group-hover:scale-105" sizes="256px" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 to-transparent px-3 pb-2 pt-6 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100">
                    {v.name}
                  </span>
                </Link>
              ))}
            </div>
            <div className="fleet-track-reverse">
              {[...row2, ...row2].map((v, i) => (
                <Link
                  key={`${v.id}-${i}`}
                  href={`/vehicles/${v.slug}`}
                  className="group relative mx-2.5 h-48 w-64 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/95"
                >
                  <Image src={v.primary_photo as string} alt={v.name} fill loading="lazy" className="object-contain p-4 transition-transform duration-500 group-hover:scale-105" sizes="256px" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 to-transparent px-3 pb-2 pt-6 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100">
                    {v.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="container-x py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <figure
              key={Number(item.id)}
              className={`group relative aspect-[4/3] overflow-hidden rounded-2xl ${i % 5 === 0 ? "sm:aspect-[16/10] sm:col-span-2 sm:row-span-2" : ""}`}
            >
              <Image
                src={String(item.image ?? FALLBACK)}
                alt={String(item.title ?? "Tour gallery")}
                fill
                loading="lazy"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <figcaption className="absolute inset-0 flex items-end bg-gradient-to-t from-ink-950/70 via-transparent to-transparent p-4 opacity-0 transition group-hover:opacity-100">
                <span>
                  <span className="block font-display text-lg font-semibold text-white">{String(item.title ?? "")}</span>
                  {item.category ? <span className="text-xs text-ink-200">{String(item.category)}</span> : null}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </>
  );
}
