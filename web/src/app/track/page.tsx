"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function TrackSearchPage() {
  const router = useRouter();
  const [bookingNo, setBookingNo] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = bookingNo.trim();
    if (!clean) {
      setError("Please enter your booking ID or reference number.");
      return;
    }
    router.push(`/track/${encodeURIComponent(clean)}`);
  }

  return (
    <div className="container-x max-w-xl py-16">
      <div className="card p-8 sm:p-10 space-y-6 shadow-md border-ink-200">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-ink-950 font-black text-2xl shadow-sm mb-2">
            📍
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900">
            Track Booking Status
          </h1>
          <p className="text-xs sm:text-sm text-ink-500 max-w-md mx-auto">
            Enter your booking reference number generated upon payment to track verification, staff approval, and pickup details.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-1.5">
              Booking Reference Number *
            </label>
            <input
              type="text"
              placeholder="e.g. BK-TEST-PAID-01 or BK-1786379830"
              value={bookingNo}
              onChange={(e) => {
                setBookingNo(e.target.value);
                setError("");
              }}
              className="w-full rounded-xl border border-ink-300 bg-white p-3.5 text-sm font-medium text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-hidden shadow-xs"
            />
            {error && <p className="mt-1.5 text-xs text-red-600 font-semibold">{error}</p>}
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-3.5 text-sm font-bold shadow-md cursor-pointer"
          >
            Track Status →
          </button>
        </form>

        <div className="border-t border-ink-100 pt-4 text-center space-y-2">
          <p className="text-xs text-ink-500">
            Already have an account?{" "}
            <Link href="/customer/portal" className="font-bold text-brand-700 hover:underline">
              View all bookings in Customer Portal
            </Link>
          </p>
          <p className="text-[11px] text-ink-400">
            Need immediate help?{" "}
            <a
              href="https://wa.me/919845210001"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 font-semibold hover:underline"
            >
              Chat on WhatsApp 💬
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
