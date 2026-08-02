import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerPortalData, portalLogout } from "@/lib/portal-actions";
import { formatINR, formatDateTime } from "@/lib/utils";
import { BookingActions } from "@/components/customer/BookingActions";
import { FeedbackForm } from "@/components/customer/FeedbackForm";
import { StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "My Dashboard", robots: { index: false, follow: false } };

export default async function CustomerPortalPage() {
  const data = await getCustomerPortalData();
  if (!data) redirect("/customer/login");
  const { target, enquiries, bookings, payments, documents } = data;

  async function logout() {
    "use server";
    await portalLogout();
  }

  return (
    <div className="container-x max-w-4xl py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">My bookings</h1>
          <p className="mt-1 text-sm text-ink-500">Your enquiries, bookings, payments and documents — all in one place.</p>
        </div>
        <form action={logout}>
          <button type="submit" className="btn-secondary">Log out</button>
        </form>
      </div>

      {enquiries.length === 0 && bookings.length === 0 && (
        <div className="card mt-8 p-8 text-center">
          <p className="font-display text-lg font-semibold text-ink-900">No bookings found</p>
          <p className="mt-2 text-sm text-ink-600">
            We could not find any booking linked to <strong>{target}</strong>. If you booked with a different number, log in with that instead.
          </p>
          <Link href="/booking" className="btn-primary mt-6">Book a vehicle</Link>
        </div>
      )}

      {enquiries.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-ink-900">Your enquiries</h2>
          <div className="mt-4 space-y-3">
            {enquiries.map((e) => (
              <div key={Number(e.id)} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-semibold text-ink-900">{String(e.enquiry_no)}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {String(e.category_name ?? "Vehicle enquiry")} · {formatDateTime(String(e.created_at ?? ""))}
                  </p>
                </div>
                <StatusBadge status={String(e.stage ?? "New")} />
              </div>
            ))}
          </div>
        </section>
      )}

      {bookings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-ink-900">Your bookings</h2>
          <div className="mt-4 space-y-4">
            {bookings.map((b) => (
              <div key={Number(b.id)} className="card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{String(b.vehicle_name ?? "Vehicle booking")}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {String(b.booking_no)} · {formatDateTime(String(b.pickup_at))} → {formatDateTime(String(b.return_at))}
                    </p>
                  </div>
                  <StatusBadge status={String(b.status)} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-ink-400">Total</dt><dd className="font-medium text-ink-800">{formatINR(Number(b.total_amount))}</dd></div>
                  <div><dt className="text-xs text-ink-400">Paid</dt><dd className="font-medium text-emerald-700">{formatINR(Number(b.paid_amount))}</dd></div>
                  <div><dt className="text-xs text-ink-400">Deposit</dt><dd className="font-medium text-ink-800">{formatINR(Number(b.deposit_amount))}</dd></div>
                  <div><dt className="text-xs text-ink-400">Balance</dt><dd className="font-medium text-amber-700">{formatINR(Number(b.total_amount) + Number(b.deposit_amount) - Number(b.paid_amount))}</dd></div>
                </dl>

                {payments.filter((p) => Number(p.booking_id) === Number(b.id)).length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Payment schedule</p>
                    <table className="mt-2 w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                          <th className="py-2 pr-4 font-semibold">Kind</th>
                          <th className="py-2 pr-4 font-semibold">Amount</th>
                          <th className="py-2 pr-4 font-semibold">Due</th>
                          <th className="py-2 text-right font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.filter((p) => Number(p.booking_id) === Number(b.id)).map((p) => (
                          <tr key={Number(p.id)} className="border-b border-ink-50">
                            <td className="py-2 pr-4 capitalize text-ink-700">{String(p.kind ?? p.payment_no)}</td>
                            <td className="py-2 pr-4 font-medium text-ink-800">{formatINR(Number(p.amount))}</td>
                            <td className="py-2 pr-4 text-ink-500">{p.due_date ? String(p.due_date) : "—"}</td>
                            <td className="py-2 text-right"><StatusBadge status={String(p.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {documents.filter((d) => Number(d.booking_id) === Number(b.id)).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Documents</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {documents.filter((d) => Number(d.booking_id) === Number(b.id)).map((d) => (
                        <span key={Number(d.id)} className="badge bg-ink-100 text-ink-700 capitalize">{String(d.kind).replace("_", " ")} {d.verified ? "✓" : "(pending review)"}</span>
                      ))}
                    </div>
                  </div>
                )}

                {String(b.status) === "Completed" && (
                  <Link href={`/invoice/${b.booking_no}`} className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">View invoice</Link>
                )}
                <BookingActions bookingId={Number(b.id)} status={String(b.status)} depositAmount={Number(b.deposit_amount)} />
                {String(b.status) === "Completed" && <FeedbackForm bookingId={Number(b.id)} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
