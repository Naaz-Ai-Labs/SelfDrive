import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { sbSelect, num } from "@/lib/supabase-rest";
import { getSetting } from "@/lib/settings";
import { getStaff } from "@/lib/data";
import { formatDateTime, formatINR, waLink } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import {
  BookingStatusSelect, BookingManagerSelect, AfterHoursApproval, InspectionForm,
  ManualAdjustmentForm, DamageReportForm, PaymentForm, MarkPaidButton,
} from "@/components/dashboard/forms";
import { DocumentVerifier } from "@/components/dashboard/DocumentVerifier";
import { BookingHeaderActions } from "@/components/dashboard/BookingHeaderActions";
import { BookingPaymentsList } from "@/components/dashboard/BookingPaymentsList";

export const metadata: Metadata = { title: "Booking detail", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const numId = Number(paramId);

  const predicates = [`booking_no.eq.${paramId}`];
  if (Number.isInteger(numId) && numId > 0) predicates.unshift(`id.eq.${numId}`);

  // bookings has two foreign keys into users (manager_id, after_hours_approved_by),
  // so users is resolved from the staff list rather than embedded.
  const bookingRes = await sbSelect<Record<string, unknown>>(
    "bookings",
    `select=*,customers(name,phone,email),vehicles(name,registration_no,deposit)&or=${encodeURIComponent(`(${predicates.join(",")})`)}&limit=1`
  );
  if (!bookingRes.ok) throw new Error(`Could not load the booking: ${bookingRes.error}`);

  const rawBooking = bookingRes.data[0];
  if (!rawBooking) notFound();

  const customer = rawBooking.customers as { name?: string; phone?: string; email?: string } | null;
  const vehicle = rawBooking.vehicles as { name?: string; registration_no?: string; deposit?: unknown } | null;
  const booking: Record<string, unknown> = {
    ...rawBooking,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_email: customer?.email ?? null,
    vehicle_name: vehicle?.name ?? null,
    registration_no: vehicle?.registration_no ?? null,
    vehicle_deposit: vehicle?.deposit === undefined ? null : num(vehicle.deposit),
  };
  const id = Number(booking.id);
  const customerId = booking.customer_id === null || booking.customer_id === undefined ? 0 : Number(booking.customer_id);

  const [statusSetting, staff, historyRes, inspectionsRes, damagesRes, adjustmentsRes, paymentsRes, documentsRes] =
    await Promise.all([
      getSetting<string[]>("booking_statuses", []),
      getStaff(),
      sbSelect<Record<string, unknown>>("booking_history", `select=*,users(name)&booking_id=eq.${id}&order=created_at.desc`),
      sbSelect<Record<string, unknown>>("inspections", `select=*&booking_id=eq.${id}&order=created_at.asc`),
      sbSelect<Record<string, unknown>>("damage_reports", `select=*&booking_id=eq.${id}`),
      sbSelect<Record<string, unknown>>("manual_adjustments", `select=*&booking_id=eq.${id}`),
      sbSelect<Record<string, unknown>>("payments", `select=*&booking_id=eq.${id}&order=created_at.desc`),
      sbSelect<Record<string, unknown>>(
        "customer_documents",
        `select=*&or=${encodeURIComponent(`(booking_id.eq.${id},customer_id.eq.${customerId})`)}`
      ),
    ]);

  for (const [label, res] of [
    ["history", historyRes],
    ["inspections", inspectionsRes],
    ["damage reports", damagesRes],
    ["adjustments", adjustmentsRes],
    ["payments", paymentsRes],
    ["documents", documentsRes],
  ] as const) {
    if (!res.ok) throw new Error(`Could not load booking ${label}: ${res.error}`);
  }

  const statuses = statusSetting?.length
    ? statusSetting
    : ["Pending", "Payment received", "Confirmed", "Vehicle handed over", "Active rental", "Completed", "Cancelled", "Rejected"];

  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  const history = (historyRes.ok ? historyRes.data : []).map((h): Record<string, unknown> => ({
    ...h,
    user_name: (h.users as { name?: string } | null)?.name ?? null,
  }));
  const inspections = inspectionsRes.ok ? inspectionsRes.data : [];
  const damages = (damagesRes.ok ? damagesRes.data : []).map((d): Record<string, unknown> => ({ ...d, charge_amount: num(d.charge_amount) }));
  // manual_adjustments references users twice (employee_id, approved_by).
  const adjustments = (adjustmentsRes.ok ? adjustmentsRes.data : []).map((a): Record<string, unknown> => ({
    ...a,
    amount: num(a.amount),
    employee_name: staffNameById.get(Number(a.employee_id)) ?? "—",
  }));
  const payments = (paymentsRes.ok ? paymentsRes.data : []).map((p): Record<string, unknown> => ({
    ...p,
    amount: num(p.amount),
    amount_paise: num(p.amount_paise),
  }));
  const documents = documentsRes.ok ? documentsRes.data : [];

  const inspectionIds = inspections.map((i) => Number(i.id)).filter(Boolean);
  let inspectionPhotos: Array<Record<string, unknown>> = [];
  if (inspectionIds.length > 0) {
    const photosRes = await sbSelect<Record<string, unknown>>(
      "inspection_photos",
      `select=*&inspection_id=in.(${inspectionIds.join(",")})`
    );
    if (!photosRes.ok) throw new Error(`Could not load inspection photos: ${photosRes.error}`);
    inspectionPhotos = photosRes.data;
  }

  const hasHandover = inspections.some((i) => i.kind === "handover");
  const hasReturn = inspections.some((i) => i.kind === "return");
  const needsAfterHoursApproval = Number(booking.after_hours) === 1 && !booking.after_hours_approved_by;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/bookings" className="text-sm text-brand-700 hover:underline">← All bookings</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-900">{String(booking.booking_no)}</h1>
            <p className="text-xs text-ink-500">Created: {formatDateTime(String(booking.created_at))}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={String(booking.status)} />
          </div>
        </div>

        <div className="mt-4">
          <BookingHeaderActions
            bookingId={id}
            currentStatus={String(booking.status)}
            notes={booking.notes as string | null}
          />
        </div>
      </div>

      {needsAfterHoursApproval && <AfterHoursApproval bookingId={id} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Vehicle & schedule</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-400">Vehicle</dt><dd className="font-medium text-ink-800">{String(booking.vehicle_name ?? "—")} ({String(booking.registration_no ?? "—")})</dd></div>
              <div><dt className="text-ink-400">Customer</dt><dd className="font-medium text-ink-800">{String(booking.customer_name ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Phone</dt><dd className="font-medium text-ink-800">
                {booking.customer_phone ? <a className="text-brand-700 hover:underline" href={waLink(String(booking.customer_phone))} target="_blank" rel="noreferrer">{String(booking.customer_phone)}</a> : "—"}
              </dd></div>
              <div><dt className="text-ink-400">Pickup</dt><dd className="font-medium text-ink-800">{formatDateTime(String(booking.pickup_at))}</dd></div>
              <div><dt className="text-ink-400">Return (scheduled)</dt><dd className="font-medium text-ink-800">{formatDateTime(String(booking.return_at))}</dd></div>
              <div><dt className="text-ink-400">Actual pickup</dt><dd className="font-medium text-ink-800">{booking.actual_pickup_at ? formatDateTime(String(booking.actual_pickup_at)) : "—"}</dd></div>
              <div><dt className="text-ink-400">Actual return</dt><dd className="font-medium text-ink-800">{booking.actual_return_at ? formatDateTime(String(booking.actual_return_at)) : "—"}</dd></div>
              <div><dt className="text-ink-400">Odometer start / end</dt><dd className="font-medium text-ink-800">{String(booking.start_odometer ?? "—")} / {String(booking.end_odometer ?? "—")}</dd></div>
            </dl>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Pricing breakdown</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {[
                ["Base rental", booking.base_amount], ["Day-type surcharge", booking.surcharge_amount], ["Extra hours", booking.extra_hours_amount],
                ["GST", booking.gst_amount], ["Extra km charge", booking.extra_km_amount], ["Late fee", booking.late_fee_amount],
                ["Damage charge", booking.damage_amount], ["Other fees", booking.other_fees_amount], ["Discount", booking.discount_amount],
              ].filter(([, v]) => Number(v) !== 0).map(([label, v]) => (
                <div key={String(label)} className="flex justify-between"><dt className="text-ink-500">{String(label)}</dt><dd className="font-medium text-ink-800">{formatINR(Number(v))}</dd></div>
              ))}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatINR(Number(booking.total_amount))}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Security deposit</dt><dd className="font-medium text-ink-800">{formatINR(Number(booking.deposit_amount))}</dd></div>
              <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><dt>Total due (incl. deposit)</dt><dd>{formatINR(Number(booking.total_amount) + Number(booking.deposit_amount))}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>{formatINR(Number(booking.paid_amount))}</dd></div>
              <div className="flex justify-between text-amber-700"><dt>Balance</dt><dd>{formatINR(Number(booking.total_amount) + Number(booking.deposit_amount) - Number(booking.paid_amount))}</dd></div>
            </dl>
            <div className="mt-4 border-t border-ink-100 pt-4">
              <p className="label mb-2">Manual adjustment / late fee override</p>
              <ManualAdjustmentForm bookingId={id} />
              {adjustments.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-ink-500">
                  {adjustments.map((a) => <li key={Number(a.id)}>{String(a.type)}: {formatINR(Number(a.amount))} — {String(a.reason)} ({String(a.employee_name)})</li>)}
                </ul>
              )}
            </div>
            <div className="mt-4 border-t border-ink-100 pt-4">
              <p className="label mb-2">Damage report</p>
              <DamageReportForm bookingId={id} />
              {damages.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-ink-500">
                  {damages.map((d) => <li key={Number(d.id)}>{String(d.description)} — {formatINR(Number(d.charge_amount))}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Handover inspection</h2>
            {hasHandover ? <p className="mt-2 text-sm text-emerald-700">✓ Handover recorded.</p> : <div className="mt-3"><InspectionForm bookingId={id} kind="handover" /></div>}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Return inspection</h2>
            {!hasHandover ? (
              <p className="mt-2 text-sm text-ink-400">Record the handover first.</p>
            ) : hasReturn ? (
              <p className="mt-2 text-sm text-emerald-700">✓ Return recorded. Late fee and extra-km charges have been calculated automatically (adjustable above).</p>
            ) : (
              <div className="mt-3"><InspectionForm bookingId={id} kind="return" /></div>
            )}
          </div>

          {inspectionPhotos.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink-900">Inspection & Geotagged Photos</h2>
                <span className="badge bg-brand-100 text-brand-800 font-semibold text-xs">
                  📍 {inspectionPhotos.length} Photos Captured
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inspectionPhotos.map((p) => (
                  <a key={Number(p.id)} href={String(p.url)} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-ink-200 bg-black shadow-sm transition hover:border-brand-500 hover:shadow-md">
                    <img src={String(p.url)} alt={String(p.side)} className="aspect-video w-full object-cover transition group-hover:scale-105" />
                    <div className="p-2 bg-ink-900/90 text-white">
                      <div className="flex items-center justify-between text-xs font-semibold capitalize text-brand-400">
                        <span>📍 {String(p.side)} View</span>
                        <span className="text-[10px] text-ink-300">View Full ↗</span>
                      </div>
                      {p.notes ? (
                        <p className="mt-0.5 truncate text-[10px] text-ink-300 font-mono" title={String(p.notes)}>
                          {String(p.notes)}
                        </p>
                      ) : null}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <h2 className="font-display text-lg font-semibold text-ink-900">Payments & Transactions</h2>
              <span className="text-xs text-ink-500">Click any transaction to view gateway & audit details</span>
            </div>
            <div className="mt-3">
              <BookingPaymentsList
                payments={payments}
                bookingInfo={{
                  booking_no: String(booking.booking_no),
                  customer_name: booking.customer_name as string,
                  customer_phone: booking.customer_phone as string,
                  customer_email: booking.customer_email as string,
                  vehicle_name: booking.vehicle_name as string,
                  registration_no: booking.registration_no as string,
                  pickup_at: String(booking.pickup_at),
                  return_at: String(booking.return_at),
                }}
              />
            </div>
            <div className="mt-4 border-t border-ink-100 pt-4"><PaymentForm bookingId={id} /></div>
          </div>

          <DocumentVerifier documents={documents} />

          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">History</h2>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm text-ink-400">No activity yet.</p>}
              {history.map((h) => (
                <div key={Number(h.id)} className="border-b border-ink-50 pb-2 text-sm last:border-0">
                  <p className="text-ink-700">{String(h.action)}</p>
                  <p className="text-xs text-ink-400">{String(h.user_name ?? "System")} · {formatDateTime(String(h.created_at))}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <p className="label">Status</p>
            <BookingStatusSelect bookingId={id} statuses={statuses} current={String(booking.status)} />
          </div>
          <div className="card p-5">
            <p className="label">Manager</p>
            <BookingManagerSelect bookingId={id} staff={staff} current={booking.manager_id as number | null} />
          </div>
          <div className="card p-5 text-sm text-ink-500">
            Terms accepted: {booking.terms_accepted_at ? formatDateTime(String(booking.terms_accepted_at)) : "Not yet"}
          </div>
        </div>
      </div>
    </div>
  );
}
