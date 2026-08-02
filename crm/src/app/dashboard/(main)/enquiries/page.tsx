import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { CreateEnquiryForm } from "@/components/dashboard/forms";

export const metadata: Metadata = { title: "Enquiries", robots: { index: false, follow: false } };
export const revalidate = 0;

export default function EnquiriesPage({ searchParams }: { searchParams: { stage?: string } }) {
  const db = getDb();
  const stages = getSetting<string[]>("enquiry_stages", []);
  const categories = (db.prepare("SELECT id, name FROM vehicle_categories ORDER BY name").all() as Array<Record<string, unknown>>).map((r) => ({ ...r })) as unknown as Array<{ id: number; name: string }>;

  const stageFilter = searchParams.stage;
  const enquiries = db
    .prepare(
      `SELECT e.*, u.name AS assignee_name FROM enquiries e LEFT JOIN users u ON u.id = e.assigned_to
       ${stageFilter ? "WHERE e.stage = ?" : ""} ORDER BY e.created_at DESC LIMIT 100`
    )
    .all(...(stageFilter ? [stageFilter] : [])) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Enquiries</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/enquiries" className={`badge ring-1 ring-inset ${!stageFilter ? "bg-brand-500 text-ink-950" : "bg-white text-ink-600 ring-ink-200"}`}>All</Link>
        {stages.map((s) => (
          <Link key={s} href={`/dashboard/enquiries?stage=${encodeURIComponent(s)}`} className={`badge ring-1 ring-inset ${stageFilter === s ? "bg-brand-500 text-ink-950" : "bg-white text-ink-600 ring-ink-200"}`}>{s}</Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="px-4 py-3 font-semibold">Enquiry</th>
              <th className="px-4 py-3 font-semibold">Name / phone</th>
              <th className="px-4 py-3 font-semibold">Pickup</th>
              <th className="px-4 py-3 font-semibold">Assigned</th>
              <th className="px-4 py-3 font-semibold">Stage</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((e) => (
              <tr key={Number(e.id)} className="border-b border-ink-50 hover:bg-ink-50/40">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/enquiries/${Number(e.id)}`} className="font-semibold text-ink-900 hover:text-brand-700">{String(e.enquiry_no)}</Link>
                </td>
                <td className="px-4 py-3 text-ink-700">{String(e.name ?? "—")}<p className="text-xs text-ink-400">{String(e.phone ?? "")}</p></td>
                <td className="px-4 py-3 text-ink-500">{e.pickup_date ? formatDateTime(String(e.pickup_date)) : "—"}</td>
                <td className="px-4 py-3 text-ink-500">{String(e.assignee_name ?? "Unassigned")}</td>
                <td className="px-4 py-3"><StatusBadge status={String(e.stage ?? "New")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {enquiries.length === 0 && <EmptyState title="No enquiries" body="Enquiries submitted via the website or created manually will appear here." />}
      </div>

      <div className="card p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Add enquiry manually</h2>
        <p className="mt-1 text-xs text-ink-500">For phone or walk-in customers.</p>
        <div className="mt-4">
          <CreateEnquiryForm categories={categories} />
        </div>
      </div>
    </div>
  );
}
