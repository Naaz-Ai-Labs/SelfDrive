"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVehicleCategory } from "@/lib/actions";

type CatItem = { id: number; name: string; kind: string; icon: string | null; image: string | null; short_desc: string | null; description: string | null; active: number; sort: number };

export function CategoryEditor({ items, isAdmin }: { items: CatItem[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CatItem | null>(null);
  const [newForm, setNewForm] = useState({ name: "", kind: "car", icon: "", shortDesc: "", description: "" });
  const [error, setError] = useState("");

  function saveEdited() {
    if (!editing) return;
    startTransition(async () => {
      await saveVehicleCategory({
        id: editing.id, name: editing.name, kind: editing.kind, icon: editing.icon ?? undefined, image: editing.image ?? undefined,
        shortDesc: editing.short_desc ?? undefined, description: editing.description ?? undefined, active: !!editing.active, sort: editing.sort,
      });
      setEditing(null);
      router.refresh();
    });
  }

  function saveNew(e: React.FormEvent) {
    e.preventDefault();
    if (newForm.name.trim().length < 2) { setError("Enter a category name."); return; }
    setError("");
    startTransition(async () => {
      await saveVehicleCategory({ name: newForm.name.trim(), kind: newForm.kind, icon: newForm.icon || undefined, shortDesc: newForm.shortDesc || undefined, description: newForm.description || undefined });
      setNewForm({ name: "", kind: "car", icon: "", shortDesc: "", description: "" });
      router.refresh();
    });
  }

  if (!isAdmin) {
    return <div className="card max-w-2xl p-6"><p className="text-sm text-ink-500">Managed by an administrator.</p></div>;
  }

  return (
    <div className="space-y-6">
      {editing ? (
        <div className="card max-w-3xl space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Edit: {editing.name}</h2>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary px-4 py-2 text-xs">Close</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Name *</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div>
              <label className="label">Vehicle kind</label>
              <select className="input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                {["bike", "scooter", "car", "van"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div><label className="label">Icon (emoji)</label><input className="input" value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
            <div><label className="label">Image URL</label><input className="input" value={editing.image ?? ""} onChange={(e) => setEditing({ ...editing, image: e.target.value })} placeholder="https://…" /></div>
            <div className="sm:col-span-2"><label className="label">Short description (cards)</label><input className="input" value={editing.short_desc ?? ""} onChange={(e) => setEditing({ ...editing, short_desc: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Description (category page)</label><textarea className="input min-h-20" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div><label className="label">Sort order</label><input className="input" type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })} className="h-4 w-4 accent-brand-600" />
            Active (visible on website)
          </label>
          <button type="button" disabled={pending} onClick={saveEdited} className="btn-primary">{pending ? "Saving…" : "Save category"}</button>
        </div>
      ) : (
        <>
          <div className="card max-w-3xl p-6">
            <h2 className="font-display text-lg font-semibold text-ink-900">Add a vehicle category</h2>
            <form onSubmit={saveNew} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><label className="label">Name *</label><input className="input" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="e.g. Premium SUVs" /></div>
              <div>
                <label className="label">Vehicle kind</label>
                <select className="input" value={newForm.kind} onChange={(e) => setNewForm({ ...newForm, kind: e.target.value })}>
                  {["bike", "scooter", "car", "van"].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className="label">Short description</label><input className="input" value={newForm.shortDesc} onChange={(e) => setNewForm({ ...newForm, shortDesc: e.target.value })} /></div>
              {error && <p className="field-error sm:col-span-2">{error}</p>}
              <button type="submit" disabled={pending} className="btn-primary w-fit">{pending ? "Adding…" : "Add category"}</button>
            </form>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {items.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">{c.icon} {c.name} {!c.active && <span className="badge bg-stone-100 text-stone-500">hidden</span>}</p>
                  <button type="button" onClick={() => setEditing(c)} className="btn-secondary px-4 py-2 text-xs">Edit</button>
                </div>
                <p className="mt-1 text-xs capitalize text-ink-400">{c.kind} · {c.short_desc ?? ""}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
