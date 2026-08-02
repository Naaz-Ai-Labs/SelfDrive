"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePricingRule, deletePricingRule } from "@/lib/actions";

type Rule = { id: number; name: string; day_type: string; start_date: string; end_date: string; rate_24h: number | null; deposit: number | null; priority: number };

export function PricingRuleForm({ vehicleId, rules }: { vehicleId: number; rules: Rule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", dayType: "weekend", startDate: "", endDate: "", rate24h: "", deposit: "", priority: "1" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate) return;
    startTransition(async () => {
      await savePricingRule({
        name: form.name.trim(), vehicleId, dayType: form.dayType, startDate: form.startDate, endDate: form.endDate,
        rate24h: form.rate24h ? Number(form.rate24h) : null, deposit: form.deposit ? Number(form.deposit) : null,
        priority: Number(form.priority) || 1,
      });
      setForm({ name: "", dayType: "weekend", startDate: "", endDate: "", rate24h: "", deposit: "", priority: "1" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <ul className="space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 p-3">
              <div>
                <p className="font-medium text-ink-800">{r.name} <span className="text-xs capitalize text-ink-400">({r.day_type})</span></p>
                <p className="text-xs text-ink-400">{r.start_date} → {r.end_date} · ₹{r.rate_24h ?? "—"}/24h · priority {r.priority}</p>
              </div>
              <button type="button" onClick={() => startTransition(() => { deletePricingRule(r.id); router.refresh(); })} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Rule name (e.g. Dasara peak)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.dayType} onChange={(e) => setForm({ ...form, dayType: e.target.value })}>
            {["weekend", "long_weekend", "holiday", "festival", "peak", "off_season"].map((d) => <option key={d} value={d}>{d.replace("_", " ")}</option>)}
          </select>
          <input className="input" type="number" placeholder="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <input className="input" type="number" placeholder="24h rate ₹" value={form.rate24h} onChange={(e) => setForm({ ...form, rate24h: e.target.value })} />
          <input className="input" type="number" placeholder="Deposit ₹" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
        </div>
        <button type="submit" disabled={pending} className="btn-secondary px-4 py-2 text-xs">Add pricing rule</button>
      </form>
    </div>
  );
}
