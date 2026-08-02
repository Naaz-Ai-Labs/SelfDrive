"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/actions";

type Row = Record<string, unknown>;
type U = { id: number; name: string; email: string; phone: string | null; role: string; active: number };

const ROLES = ["staff", "finance", "manager", "admin"];

function toU(r: Row): U {
  return {
    id: Number(r.id),
    name: String(r.name),
    email: String(r.email),
    phone: r.phone != null ? String(r.phone) : null,
    role: String(r.role),
    active: Number(r.active),
  };
}

export function StaffEditor({ users, isAdmin }: { users: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<U | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "staff", password: "" });

  function submit() {
    setError("");
    if (editing) {
      startTransition(async () => {
        await saveUser({ id: editing.id, name: editing.name, email: editing.email, phone: editing.phone ?? undefined, role: editing.role, active: !!editing.active });
        setEditing(null);
        router.refresh();
      });
      return;
    }
    if (form.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      setError("Enter a name and a valid email address.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    startTransition(async () => {
      await saveUser({ name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone || undefined, role: form.role, password: form.password });
      setForm({ name: "", email: "", phone: "", role: "staff", password: "" });
      router.refresh();
    });
  }

  if (!isAdmin) return <div className="card max-w-2xl p-6"><p className="text-sm text-ink-500">Managed by an administrator.</p></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card h-fit space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Add a staff member</h2>
        <input className="input" placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="input" type="password" placeholder="Password *" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        {error && <p className="field-error">{error}</p>}
        <button type="button" disabled={pending} onClick={submit} className="btn-primary">{pending ? "Adding…" : "Add staff"}</button>
      </div>

      <div className="space-y-2.5">
        {users.map((raw) => {
          const u = toU(raw);
          return (
            <div key={u.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{u.name} <span className={`badge ${u.role === "admin" ? "bg-brand-100 text-brand-700" : u.role === "manager" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}>{u.role}</span></p>
                <p className="truncate text-xs text-ink-400">{u.email}{u.active === 0 && " · disabled"}</p>
              </div>
              <button type="button" onClick={() => setEditing(toU(raw))} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">Edit</button>
            </div>
          );
        })}

        {editing && (
          <div className="card space-y-4 border-2 border-brand-200 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-ink-900">Edit {editing.name}</h3>
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary px-3 py-1.5 text-xs">Close</button>
            </div>
            <div className="grid gap-3">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="input" value={editing.phone ?? ""} placeholder="Phone" onChange={(e) => setEditing({ ...editing, phone: e.target.value || null })} />
                <select className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })} className="h-4 w-4 accent-brand-600" />
                Active (can log in)
              </label>
            </div>
            <button type="button" disabled={pending} onClick={submit} className="btn-primary">{pending ? "Saving…" : "Save changes"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
