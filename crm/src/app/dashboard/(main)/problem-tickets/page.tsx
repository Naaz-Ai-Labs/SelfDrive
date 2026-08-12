import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getStaff, getVehicles } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { ProblemTicketForm } from "@/components/dashboard/forms";

export const metadata: Metadata = { title: "Problem tickets", robots: { index: false, follow: false } };
export const revalidate = 0;

const FILTERS = ["Active", "Open", "In progress", "Resolved", "Cancelled", "All"] as const;

export default async function ProblemTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const db = getDb();
  const sp = await searchParams;
  const active = FILTERS.includes(sp?.status as (typeof FILTERS)[number]) ? (sp?.status as (typeof FILTERS)[number]) : "Active";

  const where = active === "All" ? "" : active === "Active" ? "WHERE t.status IN ('Open','In progress')" : "WHERE t.status = ?";
  let tickets: Array<Record<string, unknown>> = [];
  try {
    tickets = db
      .prepare(
        `SELECT t.*, b.booking_no, v.name AS vehicle_name, c.name AS customer_name FROM problem_tickets t
         LEFT JOIN bookings b ON b.id = t.booking_id LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN customers c ON c.id = t.customer_id
         ${where} ORDER BY t.created_at DESC`
      )
      .all(...(active !== "All" && active !== "Active" ? [active] : [])) as Array<Record<string, unknown>>;
  } catch (err) {
    console.error("Problem tickets query error:", err);
  }
  const staff = getStaff();
  const vehicles = getVehicles({}, false).map((v) => ({ id: v.id, name: v.name }));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Problem tickets</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "Active" ? "/dashboard/problem-tickets" : `/dashboard/problem-tickets?status=${encodeURIComponent(f)}`}
            className={`badge ring-1 ring-inset transition ${active === f ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-white text-ink-600 ring-ink-200 hover:border-brand-400"}`}
          >
            {f}
          </Link>
        ))}
      </div>

      {tickets.length === 0 && <EmptyState title="No problem tickets" body="Vehicle breakdowns, accidents and other issues reported by customers or staff will appear here." />}
      <div className="space-y-4">
        {tickets.map((t) => (
          <div key={Number(t.id)} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-900">{String(t.ticket_no)} · <span className="capitalize">{String(t.category)}</span></p>
                <p className="mt-1 text-sm text-ink-600">{String(t.description)}</p>
                <p className="text-xs text-ink-400">
                  {String(t.vehicle_name ?? "—")} · {String(t.customer_name ?? "—")}
                  {t.booking_id ? <> · <Link href={`/dashboard/bookings/${Number(t.booking_id)}`} className="text-brand-700 hover:underline">{String(t.booking_no)}</Link></> : null}
                  {" "}· {formatDateTime(String(t.created_at))}
                </p>
              </div>
              <StatusBadge status={String(t.status)} />
            </div>
            <div className="mt-4 border-t border-ink-100 pt-4">
              <ProblemTicketForm
                id={Number(t.id)}
                staff={staff}
                vehicles={vehicles}
                currentStatus={String(t.status)}
                currentAssignee={t.assigned_to ? Number(t.assigned_to) : null}
                currentReplacement={t.replacement_vehicle_id ? Number(t.replacement_vehicle_id) : null}
                currentNotes={t.resolution_notes ? String(t.resolution_notes) : null}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
