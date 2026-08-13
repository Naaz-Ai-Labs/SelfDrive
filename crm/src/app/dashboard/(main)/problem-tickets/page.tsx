import type { Metadata } from "next";
import Link from "next/link";
import { sbSelect } from "@/lib/supabase-rest";
import { getStaff, getVehicles } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge, EmptyState } from "@/components/ui";
import { ProblemTicketForm } from "@/components/dashboard/forms";

export const metadata: Metadata = { title: "Problem tickets", robots: { index: false, follow: false } };
export const revalidate = 0;

const FILTERS = ["Active", "Open", "In progress", "Resolved", "Cancelled", "All"] as const;

export default async function ProblemTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const active = FILTERS.includes(sp?.status as (typeof FILTERS)[number]) ? (sp?.status as (typeof FILTERS)[number]) : "Active";

  const statusFilter =
    active === "All"
      ? ""
      : active === "Active"
        ? `&status=${encodeURIComponent('in.("Open","In progress")')}`
        : `&status=eq.${encodeURIComponent(active)}`;

  // problem_tickets has two foreign keys into vehicles (vehicle_id and
  // replacement_vehicle_id), which PostgREST cannot disambiguate on its own — the
  // vehicle name is resolved from the fleet list below instead.
  const [ticketsRes, staff, allVehicles] = await Promise.all([
    sbSelect<Record<string, unknown>>(
      "problem_tickets",
      `select=*,bookings(booking_no),customers(name)${statusFilter}&order=created_at.desc`
    ),
    getStaff(),
    getVehicles({}, false),
  ]);
  if (!ticketsRes.ok) throw new Error(`Could not load problem tickets: ${ticketsRes.error}`);

  const vehicles = allVehicles.map((v) => ({ id: v.id, name: v.name }));
  const vehicleNameById = new Map(vehicles.map((v) => [v.id, v.name]));

  const tickets = ticketsRes.data.map((t): Record<string, unknown> => ({
    ...t,
    booking_no: (t.bookings as { booking_no?: string } | null)?.booking_no ?? null,
    customer_name: (t.customers as { name?: string } | null)?.name ?? null,
    vehicle_name: vehicleNameById.get(Number(t.vehicle_id)) ?? null,
  }));

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
