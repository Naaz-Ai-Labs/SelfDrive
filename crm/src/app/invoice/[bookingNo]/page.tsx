import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { sbSelect } from "@/lib/supabase-rest";
import { getCurrentUser } from "@/lib/auth";
import { businessInfo } from "@/lib/settings";
import { generateInvoiceForBooking } from "@/lib/invoices";
import { formatINR, formatDateTime } from "@/lib/utils";

import { InvoicePrintButton } from "@/components/customer/InvoicePrintButton";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function InvoicePage({ params }: { params: Promise<{ bookingNo: string }> }) {
  const staff = await getCurrentUser();
  if (!staff) redirect(`/dashboard/login`);

  const { bookingNo } = await params;

  const numId = Number(bookingNo);
  const predicates = [`booking_no.eq.${bookingNo}`];
  if (Number.isInteger(numId) && numId > 0) predicates.push(`id.eq.${numId}`);

  const bookingRes = await sbSelect<Record<string, unknown>>(
    "bookings",
    `select=*,customers(name,phone,email,address),vehicles(name,registration_no,brand,model)&or=${encodeURIComponent(`(${predicates.join(",")})`)}&limit=1`
  );
  if (!bookingRes.ok) throw new Error(`Could not load the booking: ${bookingRes.error}`);

  const rawBooking = bookingRes.data[0];
  if (!rawBooking) notFound();

  const customer = rawBooking.customers as { name?: string; phone?: string; email?: string; address?: string } | null;
  const vehicle = rawBooking.vehicles as { name?: string; registration_no?: string; brand?: string; model?: string } | null;
  const booking: Record<string, unknown> = {
    ...rawBooking,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_email: customer?.email ?? null,
    customer_address: customer?.address ?? null,
    vehicle_name: vehicle?.name ?? null,
    registration_no: vehicle?.registration_no ?? null,
    brand: vehicle?.brand ?? null,
    model: vehicle?.model ?? null,
  };

  // No vehicle photo is fetched: an invoice is a financial document and carries
  // billing detail only. Dropping the query as well as the markup keeps the page
  // from doing work whose only purpose was imagery.
  const [invoiceRes, info] = await Promise.all([
    sbSelect<Record<string, unknown>>("invoices", `select=*&booking_id=eq.${Number(booking.id)}&limit=1`),
    businessInfo(),
  ]);
  if (!invoiceRes.ok) throw new Error(`Could not load the invoice: ${invoiceRes.error}`);

  // lib/invoices.ts writes to Supabase now, so viewing an invoice can persist it
  // again. Generation is idempotent (it returns any existing row), and a failure
  // here must not take the page down — it falls back to the derived rendering.
  let invoice = invoiceRes.data[0];
  if (!invoice) {
    const generated = await generateInvoiceForBooking(Number(booking.id)).catch((err) => {
      console.error("[invoice] generation failed", err);
      return null;
    });
    if (generated) {
      const reread = await sbSelect<Record<string, unknown>>(
        "invoices",
        `select=*&id=eq.${generated.id}&limit=1`
      );
      if (reread.ok) invoice = reread.data[0];
    }
  }
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
            <p className="font-display text-xl font-semibold text-ink-900">{invoice ? String(invoice.invoice_no) : `INV-${String(booking.id).padStart(5, "0")}`}</p>
            <p className="text-xs text-ink-500">{invoice ? formatDateTime(String(invoice.created_at)) : formatDateTime(String(booking.created_at))}</p>
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

        {/* Deliberately no vehicle photography — see the note above the query. */}

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
              <td className="py-2 text-ink-700">Security deposit (cash at pickup, refundable)</td>
              <td className="py-2 text-right text-ink-800">{formatINR(Number(booking.deposit_amount))}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 font-semibold text-ink-900">Total Invoice</td>
              <td className="py-2 text-right font-semibold text-ink-900">{formatINR(Number(booking.total_amount))}</td>
            </tr>
            <tr>
              <td className="py-3 text-base font-bold text-ink-900">Total paid</td>
              <td className="py-3 text-right text-base font-bold text-emerald-700">{formatINR(Number(booking.paid_amount))}</td>
            </tr>
          </tbody>
        </table>

        <InvoicePrintButton />
      </div>
    </article>
  );
}
