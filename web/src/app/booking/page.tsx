import type { Metadata } from "next";
import { Suspense } from "react";
import { getVehicleCategories, getActiveTermsVersion } from "@/lib/data";
import { businessInfo } from "@/lib/settings";
import { BookingForm } from "@/components/booking/BookingForm";

export const metadata: Metadata = {
  title: "Book a Vehicle",
  description: "Book your bike, scooter or car in minutes. Your progress is saved automatically so you can pick up where you left off.",
};

export default async function BookingPage() {
  const [categories, info, terms] = await Promise.all([getVehicleCategories(), businessInfo(), getActiveTermsVersion()]);

  return (
    <section className="container-x py-12 sm:py-16">
      <Suspense fallback={<p className="text-center text-sm text-ink-400">Loading…</p>}>
        <BookingForm categories={categories} businessWhatsapp={String(info.whatsapp ?? "")} terms={terms?.content ?? []} />
      </Suspense>
    </section>
  );
}
