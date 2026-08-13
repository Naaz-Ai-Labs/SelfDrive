import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { gatewayGet } from "@/lib/gateway";
import { formatINR, formatDateTime } from "@/lib/utils";
import { createClient } from "@supabase/supabase-js";
import { cacheGet, cacheSet } from "@/lib/redis";
import { InvoicePrintButton } from "@/components/customer/InvoicePrintButton";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const revalidate = 0;

type InvoiceResponse = {
  booking: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  business: Record<string, unknown>;
  error?: string;
};

export default async function InvoicePage(props: { params: Promise<{ bookingNo: string }> }) {
  const params = await props.params;
  const bookingNo = params.bookingNo;

  let invoiceData: InvoiceResponse | null = null;

  // 1. Try Upstash Redis Session Cache first
  try {
    const cached = await cacheGet<InvoiceResponse>(`session:invoice:${bookingNo}`);
    if (cached && cached.booking) {
      invoiceData = cached;
    }
  } catch {}

  // 2. Primary Gateway Attempt
  if (!invoiceData) {
    try {
      const res = await gatewayGet<InvoiceResponse>(`/api/gateway/v1/customer/invoice/${encodeURIComponent(bookingNo)}`, { auth: true });
      if (res && res.booking) {
        invoiceData = res;
      }
    } catch {}
  }

  // 3. High-Availability Direct Supabase PostgreSQL Fallback
  if (!invoiceData) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        let query = supabase.from("bookings").select("*, vehicles(*), customers(*)");
        if (/^\d+$/.test(bookingNo)) {
          query = query.eq("id", Number(bookingNo));
        } else {
          query = query.eq("booking_no", bookingNo);
        }

        const { data: b } = await query.single();

        if (b) {
          const cust = b.customers || {};
          const veh = b.vehicles || {};

          const bookingObj = {
            id: b.id,
            booking_no: b.booking_no || `BK-${b.id}`,
            customer_name: cust.name || b.name || "Valued Customer",
            customer_phone: cust.phone || b.phone || "",
            customer_email: cust.email || b.email || "",
            customer_address: cust.address || "",
            vehicle_name: veh.name || `Vehicle #${b.vehicle_id || 1}`,
            registration_no: veh.registration_no || "",
            pickup_at: b.pickup_at,
            return_at: b.return_at,
            // PostgREST returns NUMERIC columns as STRINGS, so "0.00" is truthy and
            // `a || b` silently picks the wrong field. Coerce with Number(x ?? 0)
            // instead. Never default a money field to an invented figure — this is a
            // tax document, and the previous ||1000 / ||60 defaults could print
            // amounts the customer was never charged.
            base_amount: Number(b.base_amount ?? 0),
            other_fees_amount: Number(b.surcharge_amount ?? b.other_fees_amount ?? 0),
            extra_km_amount: Number(b.extra_km_amount ?? 0),
            late_fee_amount: Number(b.late_fee_amount ?? 0),
            damage_amount: Number(b.damage_amount ?? 0),
            gst_amount: Number(b.gst_amount ?? 0),
            discount_amount: Number(b.discount_amount ?? 0),
            total_amount: Number(b.total_amount ?? 0),
            deposit_amount: Number(b.deposit_amount ?? 0),
            paid_amount: Number(b.paid_amount ?? 0),
          };

          // A booking with no total is not renderable as an invoice. Fall through to
          // the error path rather than presenting fabricated figures as a tax invoice.
          if (!Number.isFinite(bookingObj.total_amount) || bookingObj.total_amount <= 0) {
            throw new Error(`Booking ${bookingNo} has no usable total_amount for invoicing`);
          }

          const invoiceObj = {
            invoice_no: `INV-${new Date().getFullYear()}-${String(b.id).padStart(5, "0")}`,
            created_at: b.created_at || new Date().toISOString(),
          };

          const businessObj = {
            name: "Darshh Holiday",
            address: "Main Branch: Hassan & Sakleshpura, Karnataka 573201",
            phone: "+91 98452 10001",
            email: "support@darshhholiday.com",
          };

          invoiceData = {
            booking: bookingObj,
            invoice: invoiceObj,
            business: businessObj,
          };

          // Cache in Redis for session
          try {
            await cacheSet(`session:invoice:${bookingNo}`, invoiceData, 86400);
            await cacheSet(`session:invoice:${b.id}`, invoiceData, 86400);
          } catch {}
        }
      } catch (err: any) {
        console.error("Supabase direct invoice lookup error:", err?.message || err);
      }
    }
  }

  if (!invoiceData || !invoiceData.booking) {
    redirect("/customer/portal");
  }

  const { booking, invoice, business: info } = invoiceData;

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

        {/* No vehicle photography on invoices. A tax invoice is a financial
            document — it carries billing detail only. Do not reintroduce imagery
            here or on the CRM's copy of this page. */}

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
            {/* total_amount already INCLUDES the deposit (see crm/src/lib/pricing.ts).
                Printing it as "Rental total" and then listing the deposit again made the
                column read as if the deposit were charged twice. */}
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Subtotal (excl. deposit)</td>
              <td className="py-2 text-right text-ink-800">
                {formatINR(Number(booking.total_amount) - Number(booking.deposit_amount))}
              </td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Security deposit (refundable)</td>
              <td className="py-2 text-right text-ink-800">{formatINR(Number(booking.deposit_amount))}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 font-semibold text-ink-900">Total</td>
              <td className="py-2 text-right font-semibold text-ink-900">{formatINR(Number(booking.total_amount))}</td>
            </tr>
            <tr>
              <td className="py-3 text-base font-bold text-ink-900">Total paid</td>
              <td className="py-3 text-right text-base font-bold text-ink-900">{formatINR(Number(booking.paid_amount))}</td>
            </tr>
          </tbody>
        </table>

        <InvoicePrintButton />
      </div>
    </article>
  );
}
