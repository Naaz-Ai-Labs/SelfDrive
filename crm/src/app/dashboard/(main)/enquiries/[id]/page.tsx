import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getStaff } from "@/lib/data";
import { formatDateTime, waLink, parseJSON } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";
import { EnquiryStageSelect, EnquiryAssignSelect, EnquiryNoteForm } from "@/components/dashboard/forms";

export const metadata: Metadata = { title: "Enquiry detail", robots: { index: false, follow: false } };
export const revalidate = 0;

export default function EnquiryDetailPage({ params }: { params: { id: string } }) {
  const db = getDb();
  const id = Number(params.id);
  const enquiry = db
    .prepare(`SELECT e.*, c.name AS category_name, v.name AS vehicle_name FROM enquiries e
      LEFT JOIN vehicle_categories c ON c.id = e.category_id LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE e.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!enquiry) notFound();

  const stages = getSetting<string[]>("enquiry_stages", []);
  const staff = getStaff();
  const history = db.prepare("SELECT h.*, u.name AS user_name FROM enquiry_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.enquiry_id = ? ORDER BY h.created_at DESC").all(id) as Array<Record<string, unknown>>;
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
