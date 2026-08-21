import type { Metadata } from "next";
import { Suspense } from "react";
import { getVehicleCategories, getActiveTermsVersion, getVehicles, getBranches } from "@/lib/data";
import { businessInfo } from "@/lib/settings";
import { BookingForm } from "@/components/booking/BookingForm";

export const metadata: Metadata = {
  title: "Book a Vehicle",
  description: "Book your bike, scooter or car in minutes. Your progress is saved automatically so you can pick up where you left off.",
  alternates: { canonical: "/booking" },
  openGraph: {
    title: "Book a Vehicle | Darshh Holiday",
    description: "Book your bike, scooter or car in minutes. Your progress is saved automatically so you can pick up where you left off.",
    type: "website",
    images: [{ url: "/logo.jpeg", width: 792, height: 685, alt: "Darshh Holiday booking" }],
  },
};

export default async function BookingPage() {
  const [categories, info, terms, vehicles, branches] = await Promise.all([
    getVehicleCategories(),
    businessInfo(),
    getActiveTermsVersion(),
    getVehicles(),
    getBranches(),
  ]);

  return (
    <section className="container-x py-12 sm:py-16">
      <h1 className="sr-only">Book a self-drive bike, scooter or car rental in Sakleshpura &amp; Hassan</h1>
      <Suspense fallback={<p className="text-center text-sm text-ink-400">Loading…</p>}>
        <BookingForm
          categories={categories}
          businessWhatsapp={String(info.whatsapp ?? "")}
          terms={terms?.content ?? []}
          initialVehicles={vehicles}
          branches={branches}
        />
      </Suspense>
    </section>
  );
}
