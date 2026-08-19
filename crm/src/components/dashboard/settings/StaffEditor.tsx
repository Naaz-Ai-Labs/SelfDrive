"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/actions";
import { SERVICE_SCOPES, DEFAULT_ROLE_SCOPES, parsePermissions, type ServiceScope } from "@/lib/permissions";

type Row = Record<string, unknown>;

type UserItem = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  branch: string | null;
  permissions: string[];
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
const BRANCHES = ["Main HQ", "Hassan Branch", "Sakleshpura Branch", "North Branch", "South Branch", "Airport Branch", "Central Branch"];

function toUserItem(r: Row): UserItem {
  const role = String(r.role ?? "staff");
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone != null ? String(r.phone) : null,
    role,
    branch: r.branch != null ? String(r.branch) : null,
    permissions: parsePermissions(r.permissions, role),
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
    branch: "Hassan Branch",
    role: "staff",
    password: "",
    permissions: (DEFAULT_ROLE_SCOPES.staff || []) as string[],
  });

  function handleRoleChange(newRole: string) {
    const defaultScopes = DEFAULT_ROLE_SCOPES[newRole] || DEFAULT_ROLE_SCOPES.staff || [];
    setForm({
      ...form,
      role: newRole,
      permissions: defaultScopes,
    });
  }

  function toggleFormScope(scopeId: string) {
    const current = new Set(form.permissions);
    if (current.has(scopeId)) {
      current.delete(scopeId);
    } else {
      current.add(scopeId);
    }
    setForm({ ...form, permissions: Array.from(current) });
  }

  function toggleEditingScope(scopeId: string) {
    if (!editing) return;
    const current = new Set(editing.permissions);
    if (current.has(scopeId)) {
      current.delete(scopeId);
    } else {
      current.add(scopeId);
    }
    setEditing({ ...editing, permissions: Array.from(current) });
  }

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
          permissions: form.permissions,
          password: form.password,
          active: true,
        });

        if (res?.ok) {
          setSuccess(`Successfully created ${form.name.trim()} with configured service scopes!`);
          setForm({
            name: "",
            email: "",
            phone: "",
            branch: "Hassan Branch",
            role: "staff",
            password: "",
            permissions: (DEFAULT_ROLE_SCOPES.staff || []) as string[],
          });
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
          permissions: editing.permissions,
          active: !!editing.active,
        });

        if (res?.ok) {
          setSuccess(`Updated details and service scopes for ${editing.name}.`);
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
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Add Staff Credentials Form */}
        <div className="card h-fit space-y-4 p-6 shadow-sm lg:col-span-6">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Add New Staff Member</h2>
              <p className="text-xs text-ink-500">Set credentials & select authorized service access scopes</p>
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
                <label className="label text-xs">Role Preset *</label>
                <select
                  className="input capitalize"
                  value={form.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
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

            {/* Granular Service Scopes Selection */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-ink-900">Authorized Service Access Scopes</label>
                  <p className="text-[11px] text-ink-500">Determine which services & tabs this staff member can access</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, permissions: SERVICE_SCOPES.map((s) => s.id) })}
                    className="text-brand-700 hover:underline font-semibold"
                  >
                    Select All
                  </button>
                  <span className="text-ink-300">·</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, permissions: [] })}
                    className="text-ink-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {SERVICE_SCOPES.map((scope) => {
                  const checked = form.permissions.includes(scope.id);
                  return (
                    <label
                      key={scope.id}
                      className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                        checked
                          ? "border-brand-400 bg-white font-semibold text-ink-900 shadow-2xs"
                          : "border-ink-200 bg-ink-50/60 text-ink-500 hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFormScope(scope.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded accent-brand-600"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs">{scope.label}</p>
                        <p className="text-[10px] text-ink-400 font-normal truncate">{scope.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={submitAdd}
            className="btn-primary w-full justify-center shadow-sm"
          >
            {pending ? "Creating & Syncing with Supabase…" : "Create Staff & Assign Scopes"}
          </button>
        </div>

        {/* Staff Roster & Departure List */}
        <div className="space-y-3 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink-900">Staff Roster ({users.length})</h3>
            <span className="text-xs text-ink-500">Active vs Left Organization</span>
          </div>

          <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
            {users.map((raw) => {
              const u = toUserItem(raw);
              const isInactive = u.active === 0;

              return (
                <div
                  key={u.id}
                  className={`card flex flex-col gap-2.5 p-4 transition ${
                    isInactive ? "border-red-200 bg-red-50/40" : "bg-white border-ink-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
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
                      className="btn-secondary shrink-0 px-3 py-1.5 text-xs font-semibold"
                    >
                      Edit / Scopes ⚙️
                    </button>
                  </div>

                  {/* Service Access Scopes Badges */}
                  <div className="border-t border-ink-100 pt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mr-1">Access:</span>
                    {u.role === "admin" ? (
                      <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                        ★ Full Unrestricted Admin Access
                      </span>
                    ) : u.permissions.length === 0 ? (
                      <span className="text-[10px] text-ink-400 italic">No services authorized</span>
                    ) : (
                      u.permissions.map((p) => {
                        const scopeDef = SERVICE_SCOPES.find((s) => s.id === p);
                        return (
                          <span
                            key={p}
                            className="inline-flex items-center rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 border border-ink-200"
                          >
                            {scopeDef?.label.split(" ")[0] || p}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Edit Staff Drawer Modal */}
          {editing && (
            <div className="card space-y-4 border-2 border-brand-400 bg-brand-50/40 p-5 shadow-md">
              <div className="flex items-center justify-between border-b border-brand-200 pb-2">
                <div>
                  <h3 className="font-display font-semibold text-ink-900">Manage {editing.name}</h3>
                  <p className="text-[11px] text-ink-500">Edit account details and grant/restrict service scopes</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  ✕ Close
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label text-xs">Full Name</label>
                  <input
                    className="input"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Phone</label>
                    <input
                      className="input"
                      value={editing.phone ?? ""}
                      placeholder="Phone"
                      onChange={(e) => setEditing({ ...editing, phone: e.target.value || null })}
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Role Preset</label>
                    <select
                      className="input capitalize"
                      value={editing.role}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        const defaultScopes = DEFAULT_ROLE_SCOPES[newRole] || DEFAULT_ROLE_SCOPES.staff || [];
                        setEditing({ ...editing, role: newRole, permissions: defaultScopes });
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Edit Granular Service Scopes */}
                <div className="rounded-xl border border-brand-200 bg-white p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-ink-900">Authorized Service Access Scopes</label>
                      <p className="text-[11px] text-ink-500">Check/uncheck to determine accessible modules</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, permissions: SERVICE_SCOPES.map((s) => s.id) })}
                        className="text-brand-700 hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-ink-300">·</span>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, permissions: [] })}
                        className="text-ink-500 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {SERVICE_SCOPES.map((scope) => {
                      const checked = editing.permissions.includes(scope.id);
                      return (
                        <label
                          key={scope.id}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            checked
                              ? "border-brand-400 bg-brand-50/50 font-semibold text-ink-900"
                              : "border-ink-200 bg-ink-50/40 text-ink-500 hover:bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEditingScope(scope.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded accent-brand-600"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs">{scope.label}</p>
                            <p className="text-[10px] text-ink-400 font-normal truncate">{scope.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
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
                className="btn-primary w-full justify-center shadow-sm"
              >
                {pending ? "Saving Changes…" : "Save Staff Details & Scopes"}
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
