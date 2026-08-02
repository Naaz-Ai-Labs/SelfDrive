"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSetting } from "@/lib/actions";

export function ConfigForm({
  isAdmin,
  initial,
}: {
  isAdmin: boolean;
  initial: {
    taxPct: number; enquiryStages: string[]; paymentStatuses: string[]; bookingStatuses: string[]; refundStatuses: string[]; leadSources: string[];
    rentalRules: Record<string, unknown>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState({
    taxPct: String(initial.taxPct),
    enquiryStages: initial.enquiryStages.join("\n"),
    paymentStatuses: initial.paymentStatuses.join("\n"),
    bookingStatuses: initial.bookingStatuses.join("\n"),
    refundStatuses: initial.refundStatuses.join("\n"),
    leadSources: initial.leadSources.join("\n"),
  });
  const [rules, setRules] = useState({
    standard_pickup_time: String(initial.rentalRules.standard_pickup_time ?? "08:00"),
    standard_return_time: String(initial.rentalRules.standard_return_time ?? "08:00"),
    after_hours_cutoff: String(initial.rentalRules.after_hours_cutoff ?? "20:00"),
    off_schedule_pickup_fee: String(initial.rentalRules.off_schedule_pickup_fee ?? 250),
    weekend_min_days: String(initial.rentalRules.weekend_min_days ?? 2),
    grace_period_minutes: String(initial.rentalRules.grace_period_minutes ?? 15),
    late_fee_tier1: String(initial.rentalRules.late_fee_tier1 ?? 250),
    late_fee_tier1_max_minutes: String(initial.rentalRules.late_fee_tier1_max_minutes ?? 30),
    late_fee_per_hour: String(initial.rentalRules.late_fee_per_hour ?? 150),
    late_fee_full_day_after_hours: String(initial.rentalRules.late_fee_full_day_after_hours ?? 6),
    default_extra_km_rate: String(initial.rentalRules.default_extra_km_rate ?? 8),
    default_deposit: String(initial.rentalRules.default_deposit ?? 2000),
    gateway_fee_pass_through: Boolean(initial.rentalRules.gateway_fee_pass_through ?? false),
    gateway_fee_pct: String(initial.rentalRules.gateway_fee_pct ?? 2),
    cancel_full_refund_hours: String(initial.rentalRules.cancel_full_refund_hours ?? 24),
    cancel_partial_refund_hours: String(initial.rentalRules.cancel_partial_refund_hours ?? 6),
    cancel_partial_refund_pct: String(initial.rentalRules.cancel_partial_refund_pct ?? 50),
    cancel_processing_fee_pct: String(initial.rentalRules.cancel_processing_fee_pct ?? 5),
  });

  function save(key: string, value: unknown, label: string) {
    startTransition(async () => {
      await saveSetting(key, value);
      setSaved(label);
      setTimeout(() => setSaved(""), 2000);
      router.refresh();
    });
  }

  function saveRentalRules() {
    save(
      "rental_rules",
      {
        ...rules,
        off_schedule_pickup_fee: Number(rules.off_schedule_pickup_fee),
        weekend_min_days: Number(rules.weekend_min_days),
        grace_period_minutes: Number(rules.grace_period_minutes),
        late_fee_tier1: Number(rules.late_fee_tier1),
        late_fee_tier1_max_minutes: Number(rules.late_fee_tier1_max_minutes),
        late_fee_per_hour: Number(rules.late_fee_per_hour),
        late_fee_full_day_after_hours: Number(rules.late_fee_full_day_after_hours),
        default_extra_km_rate: Number(rules.default_extra_km_rate),
        default_deposit: Number(rules.default_deposit),
        gateway_fee_pct: Number(rules.gateway_fee_pct),
        cancel_full_refund_hours: Number(rules.cancel_full_refund_hours),
        cancel_partial_refund_hours: Number(rules.cancel_partial_refund_hours),
        cancel_partial_refund_pct: Number(rules.cancel_partial_refund_pct),
        cancel_processing_fee_pct: Number(rules.cancel_processing_fee_pct),
      },
      "Rental rules"
    );
  }

  const splitLines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

  const rows = [
    { key: "enquiryStages", settingKey: "enquiry_stages", label: "Enquiry stages (one per line)" },
    { key: "paymentStatuses", settingKey: "payment_statuses", label: "Payment statuses (one per line)" },
    { key: "bookingStatuses", settingKey: "booking_statuses", label: "Booking statuses (one per line)" },
    { key: "refundStatuses", settingKey: "refund_statuses", label: "Refund statuses (one per line)" },
    { key: "leadSources", settingKey: "lead_sources", label: "Enquiry sources (one per line)" },
  ] as const;

  if (!isAdmin) {
    return (
      <div className="card max-w-2xl p-6">
        <p className="text-sm text-ink-500">Workflow configuration is managed by an administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card max-w-2xl space-y-4 p-6">
        <h3 className="font-display text-base font-semibold text-ink-900">Rental cycle &amp; pickup</h3>
        <p className="text-xs text-ink-500">Every booking is a fixed 24-hour cycle (matches the printed price list: 8AM one day to 8AM the next).</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Standard pickup time</label><input className="input" type="time" value={rules.standard_pickup_time} onChange={(e) => setRules({ ...rules, standard_pickup_time: e.target.value })} /></div>
          <div><label className="label">Standard return time</label><input className="input" type="time" value={rules.standard_return_time} onChange={(e) => setRules({ ...rules, standard_return_time: e.target.value })} /></div>
          <div><label className="label">After-hours cutoff</label><input className="input" type="time" value={rules.after_hours_cutoff} onChange={(e) => setRules({ ...rules, after_hours_cutoff: e.target.value })} /></div>
          <div><label className="label">Off-schedule pickup fee (₹)</label><input className="input" type="number" value={rules.off_schedule_pickup_fee} onChange={(e) => setRules({ ...rules, off_schedule_pickup_fee: e.target.value })} /></div>
          <div><label className="label">Weekend minimum stay (days)</label><input className="input" type="number" min={1} value={rules.weekend_min_days} onChange={(e) => setRules({ ...rules, weekend_min_days: e.target.value })} /></div>
        </div>

        <h3 className="pt-2 font-display text-base font-semibold text-ink-900">Late return</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Grace period (minutes)</label><input className="input" type="number" value={rules.grace_period_minutes} onChange={(e) => setRules({ ...rules, grace_period_minutes: e.target.value })} /></div>
          <div><label className="label">Tier-1 late fee (₹)</label><input className="input" type="number" value={rules.late_fee_tier1} onChange={(e) => setRules({ ...rules, late_fee_tier1: e.target.value })} /></div>
          <div><label className="label">Tier-1 applies up to (minutes)</label><input className="input" type="number" value={rules.late_fee_tier1_max_minutes} onChange={(e) => setRules({ ...rules, late_fee_tier1_max_minutes: e.target.value })} /></div>
          <div><label className="label">Late fee / extra hour (₹)</label><input className="input" type="number" value={rules.late_fee_per_hour} onChange={(e) => setRules({ ...rules, late_fee_per_hour: e.target.value })} /></div>
          <div><label className="label">Full-day charge after (hours late)</label><input className="input" type="number" value={rules.late_fee_full_day_after_hours} onChange={(e) => setRules({ ...rules, late_fee_full_day_after_hours: e.target.value })} /></div>
        </div>

        <h3 className="pt-2 font-display text-base font-semibold text-ink-900">Defaults &amp; payment gateway</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Default extra-km rate (₹)</label><input className="input" type="number" value={rules.default_extra_km_rate} onChange={(e) => setRules({ ...rules, default_extra_km_rate: e.target.value })} /></div>
          <div><label className="label">Default deposit (₹)</label><input className="input" type="number" value={rules.default_deposit} onChange={(e) => setRules({ ...rules, default_deposit: e.target.value })} /></div>
          <div><label className="label">Gateway fee %</label><input className="input" type="number" step={0.1} value={rules.gateway_fee_pct} onChange={(e) => setRules({ ...rules, gateway_fee_pct: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={rules.gateway_fee_pass_through} onChange={(e) => setRules({ ...rules, gateway_fee_pass_through: e.target.checked })} className="h-4 w-4 accent-brand-600" />
          Pass the payment gateway fee on to the customer as a visible line item (otherwise it's absorbed by the business)
        </label>

        <h3 className="pt-2 font-display text-base font-semibold text-ink-900">Cancellation &amp; refund slabs</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div><label className="label">Full refund if cancelled ≥ (hours before pickup)</label><input className="input" type="number" value={rules.cancel_full_refund_hours} onChange={(e) => setRules({ ...rules, cancel_full_refund_hours: e.target.value })} /></div>
          <div><label className="label">Partial refund if ≥ (hours before pickup)</label><input className="input" type="number" value={rules.cancel_partial_refund_hours} onChange={(e) => setRules({ ...rules, cancel_partial_refund_hours: e.target.value })} /></div>
          <div><label className="label">Partial refund %</label><input className="input" type="number" value={rules.cancel_partial_refund_pct} onChange={(e) => setRules({ ...rules, cancel_partial_refund_pct: e.target.value })} /></div>
          <div><label className="label">Processing fee % (on full refunds)</label><input className="input" type="number" value={rules.cancel_processing_fee_pct} onChange={(e) => setRules({ ...rules, cancel_processing_fee_pct: e.target.value })} /></div>
        </div>

        <button type="button" disabled={pending} onClick={saveRentalRules} className="btn-primary px-4 py-2 text-xs">
          Save rental rules
        </button>
      </div>

      <div className="card max-w-2xl space-y-6 p-6">
        <div>
          <label className="label" htmlFor="cfg-tax">GST / tax %</label>
          <input id="cfg-tax" className="input max-w-[160px]" type="number" min={0} max={30} step={0.5} value={form.taxPct} onChange={(e) => setForm({ ...form, taxPct: e.target.value })} />
          <button type="button" disabled={pending} onClick={() => save("tax_pct", Number(form.taxPct) || 0, "Tax %")} className="btn-primary mt-2 px-4 py-2 text-xs">Save tax %</button>
        </div>
        {rows.map((r) => (
          <div key={r.key}>
            <label className="label" htmlFor={`cfg-${r.key}`}>{r.label}</label>
            <textarea id={`cfg-${r.key}`} className="input min-h-28 font-mono text-xs" value={form[r.key]} onChange={(e) => setForm({ ...form, [r.key]: e.target.value })} />
            <button type="button" disabled={pending} onClick={() => save(r.settingKey, splitLines(form[r.key]), r.label)} className="btn-primary mt-2 px-4 py-2 text-xs">Save {r.label.toLowerCase()}</button>
          </div>
        ))}
        {saved && <p className="text-sm font-medium text-emerald-700">Saved: {saved} ✓</p>}
      </div>
    </div>
  );
}
