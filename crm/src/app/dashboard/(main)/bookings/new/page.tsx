import type { Metadata } from "next";
import Link from "next/link";
import { getVehicles, getBranches } from "@/lib/data";
import { ManualBookingForm } from "@/components/dashboard/ManualBookingForm";

export const metadata: Metadata = { title: "New counter booking", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function NewBookingPage() {
  const [vehicles, branches] = await Promise.all([getVehicles({}, true), getBranches(true)]);

  const options = vehicles
    .filter((v) => v.active === 1 && v.status !== "archived")
    .map((v) => ({
      id: v.id,
      name: v.name,
      registration_no: v.registration_no ?? null,
      rate_24h: v.rate_24h,
      deposit: v.deposit,
      available_units: v.available_units ?? 0,
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/bookings" className="text-xs font-semibold text-ink-500 hover:text-ink-900">
          Back to bookings
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-950">New counter booking</h1>
        <p className="mt-1 text-sm text-ink-500">
          For a customer booking in person or over the phone. Documents, handover and
          inspection are done from the booking page once it exists.
        </p>
      </div>

      <div className="card p-6">
        <ManualBookingForm vehicles={options} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
      </div>
    </div>
  );
}
