"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/actions";

type Row = Record<string, unknown>;

type UserItem = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  branch: string | null;
  active: number;
  left_at: string | null;
};

type HistoryItem = {
  id: number;
  staff_id: number;
  staff_name: string | null;
  staff_email: string | null;
  admin_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
};

const ROLES = ["staff", "finance", "manager", "admin"];
const BRANCHES = ["Main HQ", "North Branch", "South Branch", "East Branch", "West Branch", "Airport Branch", "Central Branch"];

function toUserItem(r: Row): UserItem {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone != null ? String(r.phone) : null,
    role: String(r.role ?? "staff"),
    branch: r.branch != null ? String(r.branch) : null,
    active: Number(r.is_active ?? r.active ?? 1),
    left_at: r.left_at != null ? String(r.left_at) : null,
  };
}

export function StaffEditor({
  users,
  history = [],
  isAdmin,
}: {
  users: Row[];
  history?: Row[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    branch: "Main HQ",
    role: "staff",
    password: "",
  });

  function submitAdd() {
    setError("");
    setSuccess("");

    if (form.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      setError("Enter a valid name and email address.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          branch: form.branch,
          role: form.role,
          password: form.password,
          active: true,
        });

        if (res?.ok) {
          setSuccess(`Successfully created ${form.name.trim()} and synced credentials with Supabase!`);
          setForm({ name: "", email: "", phone: "", branch: "Main HQ", role: "staff", password: "" });
          router.refresh();
        }
      } catch (err: any) {
        setError(err?.message || "Failed to create staff member.");
      }
    });
  }

  function submitEdit() {
    if (!editing) return;
    setError("");
    setSuccess("");

    startTransition(async () => {
      try {
        const res = await saveUser({
          id: editing.id,
          name: editing.name,
          email: editing.email,
          phone: editing.phone ?? undefined,
          branch: editing.branch ?? undefined,
          role: editing.role,
          active: !!editing.active,
        });

        if (res?.ok) {
          setSuccess(`Updated details for ${editing.name}.`);
          setEditing(null);
          router.refresh();
        }
      } catch (err: any) {
        setError(err?.message || "Failed to update staff member.");
      }
    });
  }

  if (!isAdmin) {
    return (
      <div className="card max-w-2xl p-6">
        <p className="text-sm text-ink-500">Staff management is reserved for administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner Message */}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          ✅ {success}
        </div>
      )}

      {/* Main Grid: Add Staff Form + Staff List */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add Staff Credentials Form */}
        <div className="card h-fit space-y-4 p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Add New Staff Member</h2>
              <p className="text-xs text-ink-500">Creates login & syncs credentials with Supabase Auth</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              ⚡ Supabase Synced
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label text-xs">Full Name *</label>
              <input
                className="input"
                placeholder="e.g. Rahul Sharma"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label text-xs">Email Address (Login ID) *</label>
              <input
                className="input"
                type="email"
                placeholder="e.g. rahul.staff@darshh.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Role *</label>
                <select
                  className="input capitalize"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label text-xs">Branch *</label>
                <select
                  className="input"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Phone (Optional)</label>
                <input
                  className="input"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="label text-xs">Password *</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={submitAdd}
            className="btn-primary w-full justify-center"
          >
            {pending ? "Creating & Syncing with Supabase…" : "Create & Sync Staff Credentials"}
          </button>
        </div>

        {/* Staff Roster & Departure List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink-900">Staff Roster ({users.length})</h3>
            <span className="text-xs text-ink-500">Active vs Left Organization</span>
          </div>

          <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
            {users.map((raw) => {
              const u = toUserItem(raw);
              const isInactive = u.active === 0;

              return (
                <div
                  key={u.id}
                  className={`card flex items-center justify-between gap-3 p-4 transition ${
                    isInactive ? "border-red-200 bg-red-50/40" : "bg-white"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-900">{u.name}</p>
                      <span
                        className={`badge ${
                          u.role === "admin"
                            ? "bg-amber-100 text-amber-800"
                            : u.role === "manager"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {u.role}
                      </span>
                      {isInactive ? (
                        <span className="badge bg-red-100 text-red-700">Left Org</span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                      )}
                    </div>

                    <p className="truncate text-xs text-ink-500">
                      {u.email} {u.branch ? `• ${u.branch}` : ""}
                    </p>

                    {isInactive && u.left_at && (
                      <p className="text-[11px] font-medium text-red-600">
                        🚪 Left Organization on: {u.left_at}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing(u)}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                  >
                    Edit / Status
                  </button>
                </div>
              );
            })}
          </div>

          {/* Edit Staff Drawer Modal */}
          {editing && (
            <div className="card space-y-4 border-2 border-brand-300 bg-brand-50/30 p-5">
              <div className="flex items-center justify-between border-b border-brand-200 pb-2">
                <h3 className="font-display font-semibold text-ink-900">Manage {editing.name}</h3>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                <input
                  className="input"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="input"
                    value={editing.phone ?? ""}
                    placeholder="Phone"
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value || null })}
                  />

                  <select
                    className="input capitalize"
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border border-ink-200 bg-white p-3 space-y-2">
                  <label className="flex items-center gap-2.5 text-sm font-medium text-ink-800">
                    <input
                      type="checkbox"
                      checked={!!editing.active}
                      onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })}
                      className="h-4 w-4 rounded accent-brand-600"
                    />
                    Active Staff Member (Can Log In)
                  </label>
                  {!editing.active && (
                    <p className="text-xs text-red-600">
                      ⚠️ Unchecking this marks the user as <strong>Inactive (Left Organization)</strong> and records their departure timestamp in Supabase & history.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={submitEdit}
                className="btn-primary w-full justify-center"
              >
                {pending ? "Saving Changes…" : "Save Staff Changes"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Staff Departure & Audit Trail History */}
      <div className="card p-6 space-y-4 shadow-sm border border-ink-200">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">
              Staff Onboarding & Departure Audit Log
            </h3>
            <p className="text-xs text-ink-500">
              Complete history of staff additions, role updates, and organization departure dates
            </p>
          </div>
          <span className="rounded-lg bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
            {history.length} Audit Records
          </span>
        </div>

        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">No staff history recorded yet.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {history.map((hRaw) => {
              const h = hRaw as HistoryItem;
              let detailObj: any = {};
              try {
                detailObj = h.detail ? JSON.parse(h.detail) : {};
              } catch {}

              const actionColor =
                h.action === "deactivated"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : h.action === "created"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-blue-200 bg-blue-50 text-blue-800";

              return (
                <div
                  key={h.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs ${actionColor}`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold">
                      {h.action === "deactivated" ? "🚪 Staff Departure (Left Org)" : h.action === "created" ? "✨ New Staff Registered" : "📝 Staff Record Updated"}
                    </p>
                    <p className="text-ink-700">
                      Staff: <strong>{detailObj.name || h.staff_name || h.staff_email}</strong> ({detailObj.email || h.staff_email})
                    </p>
                    {detailObj.left_at && (
                      <p className="font-mono text-[11px] text-red-700">
                        Departure Date: {detailObj.left_at}
                      </p>
                    )}
                  </div>

                  <div className="text-right text-[11px] text-ink-500">
                    <p>Performed by: {detailObj.performed_by_name || h.admin_name || "Admin"}</p>
                    <p className="font-mono">{h.created_at}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
