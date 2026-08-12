import type { Metadata } from "next";
import Link from "next/link";
import { getBookingTrackingData } from "@/lib/tracking-actions";
import { BookingStatusFlow } from "@/components/tracking/BookingStatusFlow";

export const metadata: Metadata = {
  title: "Track Booking Status",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function TrackBookingPage(props: {
  params: Promise<{ bookingNo: string }>;
}) {
  const { bookingNo } = await props.params;
  const tracking = await getBookingTrackingData(bookingNo);

  if (!tracking) {
    return (
      <div className="container-x max-w-xl py-16">
        <div className="card p-8 text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-900 text-xl font-bold">
            🔍
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-900">
            Booking Not Found
          </h1>
          <p className="text-xs sm:text-sm text-ink-600 max-w-md mx-auto">
            We could not find any active booking under <strong>{bookingNo}</strong>. Please verify the reference number sent to your phone/email or contact our support team.
          </p>

          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link href="/track" className="btn-secondary text-xs px-4 py-2">
              ← Try Another Reference
            </Link>
            <a
              href={`https://wa.me/919845210001?text=${encodeURIComponent(
                `Hello Darshh Holiday, I need help finding my booking for reference ${bookingNo}.`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700"
            >
              Contact Support 💬
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-x max-w-4xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/track" className="text-xs font-semibold text-brand-700 hover:underline">
          ← Track another booking
        </Link>
        <Link href="/customer/portal" className="text-xs font-semibold text-ink-500 hover:text-ink-900">
          Customer Portal ↗
        </Link>
      </div>

      <BookingStatusFlow tracking={tracking} />
    </div>
  );
}
