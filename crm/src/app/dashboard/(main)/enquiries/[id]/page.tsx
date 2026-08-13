import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { sbSelect } from "@/lib/supabase-rest";
import { getSetting } from "@/lib/settings";
import { getStaff } from "@/lib/data";
import { formatDateTime, waLink, parseJSON } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { EnquiryStageSelect, EnquiryAssignSelect, EnquiryNoteForm } from "@/components/dashboard/forms";

export const metadata: Metadata = { title: "Enquiry detail", robots: { index: false, follow: false } };
export const revalidate = 0;

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const numId = Number(paramId);

  const predicates = [`enquiry_no.eq.${paramId}`];
  if (Number.isInteger(numId) && numId > 0) predicates.unshift(`id.eq.${numId}`);

  const enquiryRes = await sbSelect<Record<string, unknown>>(
    "enquiries",
    `select=*,vehicle_categories(name),vehicles(name)&or=${encodeURIComponent(`(${predicates.join(",")})`)}&limit=1`
  );
  if (!enquiryRes.ok) throw new Error(`Could not load the enquiry: ${enquiryRes.error}`);

  const row = enquiryRes.data[0];
  if (!row) notFound();

  const enquiry: Record<string, unknown> = {
    ...row,
    category_name: (row.vehicle_categories as { name?: string } | null)?.name ?? null,
    vehicle_name: (row.vehicles as { name?: string } | null)?.name ?? null,
  };
  const id = Number(enquiry.id);

  const [stagesSetting, staff, historyRes] = await Promise.all([
    getSetting<string[]>("enquiry_stages", []),
    getStaff(),
    sbSelect<Record<string, unknown>>(
      "enquiry_history",
      `select=*,users(name)&enquiry_id=eq.${id}&order=created_at.desc`
    ),
  ]);
  if (!historyRes.ok) throw new Error(`Could not load enquiry history: ${historyRes.error}`);

  const stages = stagesSetting?.length ? stagesSetting : ["New", "Contacted", "Quoted", "Converted", "Closed", "Lost"];
  const history = historyRes.data.map((h): Record<string, unknown> => ({ ...h, user_name: (h.users as { name?: string } | null)?.name ?? null }));
  const data = parseJSON<Record<string, unknown>>(String(enquiry.data ?? "{}"), {});

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/enquiries" className="text-sm text-brand-700 hover:underline">← All enquiries</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-900">{String(enquiry.enquiry_no)}</h1>
          <StatusBadge status={String(enquiry.stage ?? "New")} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Customer & request</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-400">Name</dt><dd className="font-medium text-ink-800">{String(enquiry.name ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Phone</dt><dd className="font-medium text-ink-800">
                {enquiry.phone ? <a className="text-brand-700 hover:underline" href={waLink(String(enquiry.phone))} target="_blank" rel="noreferrer">{String(enquiry.phone)}</a> : "—"}
              </dd></div>
              <div><dt className="text-ink-400">Email</dt><dd className="font-medium text-ink-800">{String(enquiry.email ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Vehicle type</dt><dd className="font-medium text-ink-800">{String(enquiry.category_name ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Vehicle</dt><dd className="font-medium text-ink-800">{String(enquiry.vehicle_name ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Location</dt><dd className="font-medium text-ink-800">{String(enquiry.location ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Pickup</dt><dd className="font-medium text-ink-800">{enquiry.pickup_date ? formatDateTime(String(enquiry.pickup_date)) : "—"}</dd></div>
              <div><dt className="text-ink-400">Return</dt><dd className="font-medium text-ink-800">{enquiry.return_date ? formatDateTime(String(enquiry.return_date)) : "—"}</dd></div>
              <div><dt className="text-ink-400">Passengers</dt><dd className="font-medium text-ink-800">{String(enquiry.passengers ?? "—")}</dd></div>
              <div><dt className="text-ink-400">Source</dt><dd className="font-medium text-ink-800">{String(enquiry.source ?? "—")}</dd></div>
            </dl>
            {Object.keys(data).length > 0 && (
              <div className="mt-4 border-t border-ink-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Additional details</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(data).filter(([k]) => !["contact"].includes(k)).map(([k, v]) => (
                    <div key={k}><dt className="text-ink-400">{k}</dt><dd className="text-ink-800">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Activity</h2>
            <div className="mt-3 space-y-3">
              {history.length === 0 && <p className="text-sm text-ink-400">No activity yet.</p>}
              {history.map((h) => (
                <div key={Number(h.id)} className="border-b border-ink-50 pb-3 text-sm last:border-0">
                  <p className="text-ink-700">{String(h.detail ?? h.action)}</p>
                  <p className="text-xs text-ink-400">{String(h.user_name ?? "System")} · {formatDateTime(String(h.created_at))}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-ink-100 pt-4">
              <EnquiryNoteForm enquiryId={id} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <p className="label">Stage</p>
            <EnquiryStageSelect enquiryId={id} stages={stages} current={String(enquiry.stage ?? "New")} />
          </div>
          <div className="card p-5">
            <p className="label">Assigned to</p>
            <EnquiryAssignSelect enquiryId={id} staff={staff} current={enquiry.assigned_to as number | null} />
          </div>
        </div>
      </div>
    </div>
  );
}
