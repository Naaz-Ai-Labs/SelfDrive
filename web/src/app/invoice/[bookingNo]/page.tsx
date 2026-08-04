import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { gatewayGet } from "@/lib/gateway";
import { formatINR, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const revalidate = 0;

type InvoiceResponse = {
  booking: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  photoUrl: string | null;
  business: Record<string, unknown>;
  error?: string;
};

export default async function InvoicePage(props: { params: Promise<{ bookingNo: string }> }) {
  const params = await props.params;
  const res = await gatewayGet<InvoiceResponse>(`/api/gateway/v1/customer/invoice/${encodeURIComponent(params.bookingNo)}`, { auth: true });
  if (!res || res.error === "Not found.") notFound();
  if (!res || res.error) redirect("/customer/login");

  const { booking, invoice, photoUrl, business: info } = res;

  const lines = [
    ["Base rental", Number(booking.base_amount)],
    ["Off-schedule / other fees", Number(booking.other_fees_amount)],
    ["Extra km charge", Number(booking.extra_km_amount)],
    ["Late fee", Number(booking.late_fee_amount)],
    ["Damage charge", Number(booking.damage_amount)],
  ].filter(([, v]) => Number(v) > 0) as Array<[string, number]>;

  return (
    <article className="container-x max-w-3xl py-10 print:py-2">
      <div className="card p-8 print:border-0 print:bg-white print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-6">
          <div>
            <p className="font-display text-2xl font-semibold text-ink-900">{String(info.name ?? "Darshh Holiday")}</p>
            <p className="mt-1 text-sm text-ink-500">{String(info.address ?? "")}</p>
            <p className="text-sm text-ink-500">{String(info.phone ?? "")} · {String(info.email ?? "")}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Tax Invoice</p>
            <p className="font-display text-xl font-semibold text-ink-900">{invoice ? String(invoice.invoice_no) : "Draft"}</p>
            <p className="text-xs text-ink-500">{invoice ? formatDateTime(String(invoice.created_at)) : "Not yet issued"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Billed to</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{String(booking.customer_name ?? "—")}</p>
            <p className="text-sm text-ink-600">{String(booking.customer_phone ?? "")}</p>
            <p className="text-sm text-ink-600">{String(booking.customer_email ?? "")}</p>
            <p className="text-sm text-ink-600">{String(booking.customer_address ?? "")}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Booking</p>
            <p className="mt-1 text-sm text-ink-700">{String(booking.booking_no)}</p>
            <p className="text-sm text-ink-700">{String(booking.vehicle_name)} ({String(booking.registration_no ?? "—")})</p>
            <p className="text-sm text-ink-700">{formatDateTime(String(booking.pickup_at))} → {formatDateTime(String(booking.return_at))}</p>
          </div>
        </div>

        {photoUrl && (
          <div className="relative mt-6 h-48 w-full overflow-hidden rounded-xl bg-ink-100">
            <Image src={photoUrl} alt={String(booking.vehicle_name)} fill className="object-cover" sizes="700px" />
          </div>
        )}

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, value]) => (
              <tr key={label} className="border-b border-ink-50">
                <td className="py-2 text-ink-700">{label}</td>
                <td className="py-2 text-right text-ink-800">{formatINR(value)}</td>
              </tr>
            ))}
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">GST</td>
              <td className="py-2 text-right text-ink-800">{formatINR(Number(booking.gst_amount))}</td>
            </tr>
            {Number(booking.discount_amount) > 0 && (
              <tr className="border-b border-ink-50">
                <td className="py-2 text-ink-700">Discount</td>
                <td className="py-2 text-right text-emerald-700">-{formatINR(Number(booking.discount_amount))}</td>
              </tr>
            )}
            <tr className="border-b border-ink-50">
              <td className="py-2 font-semibold text-ink-900">Rental total</td>
              <td className="py-2 text-right font-semibold text-ink-900">{formatINR(Number(booking.total_amount))}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Security deposit (refundable)</td>
              <td className="py-2 text-right text-ink-800">{formatINR(Number(booking.deposit_amount))}</td>
            </tr>
            <tr>
              <td className="py-3 text-base font-bold text-ink-900">Total paid</td>
              <td className="py-3 text-right text-base font-bold text-ink-900">{formatINR(Number(booking.paid_amount))}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-8 flex justify-end gap-3 print:hidden">
          <button type="button" className="btn-secondary">Download / Print</button>
        </div>
      </div>
    </article>
  );
}
