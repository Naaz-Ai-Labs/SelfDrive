"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplate } from "@/lib/actions";

type Row = Record<string, unknown>;
type Tpl = { id: number; key: string; name: string; channel: string; subject: string | null; body: string; active: number };

function toTpl(r: Row): Tpl {
  return {
    id: Number(r.id),
    key: String(r.key),
    name: String(r.name),
    channel: String(r.channel),
    subject: r.subject != null ? String(r.subject) : null,
    body: String(r.body),
    active: Number(r.active),
  };
}

export function TemplateEditor({ items, isAdmin }: { items: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [error, setError] = useState("");

  function submit() {
    if (!editing) return;
    if (editing.body.trim().length < 5) {
      setError("Template body is too short.");
      return;
    }
    setError("");
    startTransition(async () => {
      await saveTemplate(editing.id, {
        key: editing.key,
        name: editing.name,
        channel: editing.channel,
        subject: editing.subject ?? undefined,
        body: editing.body,
        active: !!editing.active,
      });
      setEditing(null);
      router.refresh();
    });
  }

  if (!isAdmin) return <div className="card max-w-2xl p-6"><p className="text-sm text-ink-500">Managed by an administrator.</p></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2.5">
        {items.map((raw) => {
          const t = toTpl(raw);
          return (
            <div key={t.id} className={`card flex items-center justify-between gap-3 p-4 ${t.active ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-400">{t.key} · {t.channel} · {t.body.length} chars</p>
              </div>
              <button type="button" onClick={() => setEditing(toTpl(raw))} className="btn-secondary shrink-0 px-4 py-2 text-xs">Edit</button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="card h-fit space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Edit template</h2>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary px-4 py-2 text-xs">Close</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Channel</label>
              <select className="input" value={editing.channel} onChange={(e) => setEditing({ ...editing, channel: e.target.value })}>
                {["whatsapp", "email", "sms", "internal"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {editing.channel === "email" && (
            <div>
              <label className="label">Subject</label>
              <input className="input" value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </div>
          )}
          <div>
            <label className="label">Body — placeholders: {`{name}`} {`{enquiry_no}`} {`{booking_no}`} {`{vehicle}`} {`{pickup_at}`} {`{return_at}`} {`{total}`} {`{amount}`} {`{transaction_ref}`} {`{category}`} {`{business}`}</label>
            <textarea className="input min-h-40 font-mono text-xs" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })} className="h-4 w-4 accent-brand-600" />
            Active
          </label>
          {error && <p className="field-error">{error}</p>}
          <button type="button" disabled={pending} onClick={submit} className="btn-primary">{pending ? "Saving…" : "Save template"}</button>
        </div>
      )}
    </div>
  );
}
