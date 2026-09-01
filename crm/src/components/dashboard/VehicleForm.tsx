"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveVehicle, addVehiclePhoto, deleteVehicle } from "@/lib/actions";
import { type Vehicle, type VehicleUnit, getCategoryPresetPhoto } from "@/lib/data";
import { compressImageFile } from "@/lib/image-compression";

/**
 * Sentinel for the "don't touch the units" choice in Overall Fleet Status.
 *
 * Picking any real status here rewrites EVERY unit's status, so setting a vehicle to
 * Unavailable wiped the individual Booked / In Transit / Available values that had just
 * been set per unit below. This value is never persisted: on save the vehicle's own
 * status is derived from the units instead, so the public site still reflects reality
 * (any unit available => the vehicle is bookable).
 */
const KEEP_UNIT_STATUS = "__keep_unit_status";

function getUpperSlug(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(0, 6) || "UNIT";
}

export type PhysicalUnitItem = {
  id?: number;
  unit_identifier: string;
  registration_no: string;
  current_branch_id: number | null;
  status: string;
  notes: string;
};

export function VehicleForm({
  categories,
  branches,
  vehicle,
  initialUnits,
}: {
  categories: Array<{ id: number; name: string }>;
  branches: Array<{ id: number; name: string }>;
  vehicle?: Vehicle;
  initialUnits?: VehicleUnit[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);

  const initialBranchId = vehicle?.branch_id ? String(vehicle.branch_id) : (branches[0]?.id ? String(branches[0].id) : "");

  const [form, setForm] = useState({
    name: vehicle?.name ?? "",
    brand: vehicle?.brand ?? "",
    model: vehicle?.model ?? "",
    year: vehicle?.year ? String(vehicle.year) : "",
    categoryId: vehicle?.category_id ? String(vehicle.category_id) : "",
    branchId: initialBranchId,
    registrationNo: vehicle?.registration_no ?? "",
    cc: vehicle?.cc ? String(vehicle.cc) : "",
    fuelType: vehicle?.fuel_type ?? "Petrol",
    transmission: vehicle?.transmission ?? "Manual",
    seats: vehicle ? String(vehicle.seats) : "",
    mileage: vehicle?.mileage ?? "",
    includedKm: vehicle ? String(vehicle.included_km) : "100",
    extraKmRate: vehicle ? String(vehicle.extra_km_rate) : "8",
    rate24h: vehicle ? String(vehicle.rate_24h) : "",
    hourlyRate: vehicle ? String(vehicle.hourly_rate) : "",
    deposit: vehicle ? String(vehicle.deposit) : "2000",
    lateFeePerHour: vehicle ? String(vehicle.late_fee_per_hour) : "150",
    totalUnits: vehicle?.total_units ? String(vehicle.total_units) : "1",
    description: vehicle?.description ?? "",
    status: vehicle?.status ?? "available",
    overallReason: "",
  });

  const [photoUrl, setPhotoUrl] = useState("");

  const totalUnitsNum = Math.max(1, Number(form.totalUnits) || 1);

  const [unitsList, setUnitsList] = useState<PhysicalUnitItem[]>(() => {
    const prefix = getUpperSlug(vehicle?.name ?? "UNIT");
    const count = vehicle?.total_units ? Math.max(1, Number(vehicle.total_units)) : 1;
    const defaultBranch = vehicle?.branch_id ?? (branches[0]?.id || null);

    if (initialUnits && initialUnits.length > 0) {
      return initialUnits.map((u, i) => ({
        id: u.id,
        unit_identifier: u.unit_identifier || `${prefix}-${String(i + 1).padStart(3, "0")}`,
        registration_no: u.registration_no || (i === 0 ? vehicle?.registration_no || "" : ""),
        current_branch_id: u.current_branch_id || defaultBranch,
        status: u.status || "available",
        notes: u.notes || "",
      }));
    }

    return Array.from({ length: count }, (_, i) => ({
      unit_identifier: `${prefix}-${String(i + 1).padStart(3, "0")}`,
      registration_no: i === 0 ? vehicle?.registration_no || "" : "",
      current_branch_id: defaultBranch,
      status: "available",
      notes: "",
    }));
  });

  useEffect(() => {
    const prefix = getUpperSlug(form.name || "UNIT");
    const targetCount = Math.max(1, Number(form.totalUnits) || 1);
    const defaultBranch = form.branchId ? Number(form.branchId) : (branches[0]?.id || null);

    setUnitsList((prev) => {
      if (prev.length === targetCount) return prev;
      if (prev.length < targetCount) {
        const next = [...prev];
        for (let i = prev.length; i < targetCount; i++) {
          next.push({
            unit_identifier: `${prefix}-${String(i + 1).padStart(3, "0")}`,
            registration_no: "",
            current_branch_id: defaultBranch,
            status: "available",
            notes: "",
          });
        }
        return next;
      }
      return prev.slice(0, targetCount);
    });
  }, [form.totalUnits, form.name, form.branchId, branches]);

  function handleOverallStatusChange(newStatus: string) {
    setForm((prev) => ({ ...prev, status: newStatus }));

    // KEEP_UNIT_STATUS means "leave every unit exactly as it is". Each unit's status is
    // then managed only in the Physical Fleet Units rows below, so one unit going to
    // Booked or In Transit no longer drags the other four with it.
    if (newStatus === KEEP_UNIT_STATUS) return;

    if (newStatus === "unavailable" || newStatus === "blocked") {
      setUnitsList((prev) =>
        prev.map((u) => ({ ...u, status: newStatus }))
      );
    } else if (newStatus === "available") {
      setUnitsList((prev) =>
        prev.map((u) => (u.status === "unavailable" || u.status === "blocked" ? { ...u, status: "available" } : u))
      );
    }
  }

  function handleUnitChange(index: number, field: keyof PhysicalUnitItem, value: any) {
    let nextUnits: PhysicalUnitItem[] = [];
    setUnitsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      nextUnits = updated;
      return updated;
    });

    if (index === 0 && field === "registration_no") {
      setForm((prev) => ({ ...prev, registrationNo: value }));
    }

    if (field === "status") {
      const allUnavail = nextUnits.every(
        (u) => u.status === "unavailable" || u.status === "blocked"
      );
      if (allUnavail) {
        setForm((prev) => ({ ...prev, status: "unavailable" }));
      } else if (nextUnits.some((u) => u.status === "available")) {
        setForm((prev) => (prev.status === "unavailable" ? { ...prev, status: "available" } : prev));
      }
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim() || !form.model.trim()) {
      setError("Name, brand, and model are required.");
      return;
    }
    if (!form.branchId) {
      setError("Please assign a primary branch for this vehicle.");
      return;
    }
    if (!form.registrationNo.trim()) {
      setError("Primary Vehicle Plate / Registration Number is required (e.g. KA-46-M-5566).");
      return;
    }

    setError("");
    setSuccess("");

    const isEntireVehicleUnavailable = form.status === "unavailable" || form.status === "blocked";
    if (isEntireVehicleUnavailable && !form.overallReason.trim()) {
      setError("Enter a reason for taking the whole fleet offline — this affects every unit, on every future date.");
      return;
    }

    // With "No change" selected the vehicle's own status is derived from its units, so a
    // fleet with one free unit stays bookable on the public site instead of being pinned
    // to whatever the dropdown happened to show.
    const effectiveStatus =
      form.status === KEEP_UNIT_STATUS
        ? (unitsList.some((u) => (u.status || "available") === "available") ? "available" : "unavailable")
        : form.status;

    startTransition(async () => {
      try {
        const res = await saveVehicle({
          id: vehicle?.id,
          name: form.name.trim(),
          brand: form.brand.trim(),
          model: form.model.trim(),
          year: form.year ? Number(form.year) : undefined,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          branchId: Number(form.branchId),
          registrationNo: form.registrationNo.trim() || undefined,
          cc: form.cc ? Number(form.cc) : undefined,
          fuelType: form.fuelType,
          transmission: form.transmission,
          seats: Number(form.seats) || 2,
          mileage: form.mileage || undefined,
          includedKm: Number(form.includedKm) || 100,
          extraKmRate: Number(form.extraKmRate) || 0,
          rate24h: Number(form.rate24h) || 0,
          hourlyRate: Number(form.hourlyRate) || 0,
          deposit: Number(form.deposit) || 0,
          lateFeePerHour: Number(form.lateFeePerHour) || 0,
          totalUnits: totalUnitsNum,
          description: form.description || undefined,
          status: effectiveStatus,
          cascadeUnitStatus: form.status !== KEEP_UNIT_STATUS,
          active: true,
          photoUrl: photoUrl.trim() || undefined,
          physicalUnits: unitsList.map((u) => ({
            id: u.id,
            unit_identifier: u.unit_identifier,
            registration_no: u.registration_no?.trim() || undefined,
            current_branch_id: u.current_branch_id ?? Number(form.branchId),
            status: isEntireVehicleUnavailable ? form.status : u.status,
            notes: isEntireVehicleUnavailable ? form.overallReason.trim() : u.notes?.trim() || undefined,
          })),
        });

        if (res?.ok) {
          setSuccess("Vehicle details and fleet units saved successfully!");
          router.refresh();
          if (!vehicle) {
            setForm({ ...form, name: "", brand: "", model: "", registrationNo: "" });
            setPhotoUrl("");
          }
        } else {
          setError(res?.error || "Could not save vehicle.");
        }
      } catch (err: any) {
        setError(err?.message || "Could not save vehicle.");
      }
    });
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const compressed = await compressImageFile(file);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok && data.path) {
        setPhotoUrl(data.path);
        if (vehicle?.id) {
          await addVehiclePhoto(vehicle.id, data.path, vehicle.photos.length === 0);
          router.refresh();
        }
      } else {
        setError(data.error || "Failed to upload image.");
      }
    } catch {
      setError("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete() {
    if (!vehicle?.id) return;
    if (!confirm(`Are you sure you want to permanently delete "${vehicle.name}"?`)) return;

    startTransition(async () => {
      setError("");
      const res = await deleteVehicle(vehicle.id);
      if (res && !res.ok) {
        setError(res.error || "Failed to delete vehicle.");
        return;
      }
      router.push("/dashboard/vehicles");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
          ✅ {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label font-semibold">Display Name *</label>
            <input
              className="input"
              value={form.name}
              placeholder="e.g. Lexus LC500"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label font-semibold">Brand *</label>
            <input
              className="input"
              value={form.brand}
              placeholder="e.g. Lexus"
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div>
            <label className="label font-semibold">Model *</label>
            <input
              className="input"
              value={form.model}
              placeholder="e.g. LC500"
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label font-semibold">Year</label>
            <input
              className="input"
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </div>
          <div>
            <label className="label font-semibold">Category *</label>
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => {
                // A blanket default of "5" put five seats on every scooter and bike
                // added through this form. Seat count is a property of the category,
                // so seed it from the chosen one — and only when the operator has not
                // already typed a value, so an Ertiga (7) or a Thar (4) is never
                // overwritten.
                const catName = (categories.find((c) => String(c.id) === String(e.target.value))?.name ?? "").toLowerCase();
                const presetSeats = /scooter|bike/.test(catName) ? "2" : /tempo|van/.test(catName) ? "12" : "5";
                setForm((prev) => ({ ...prev, categoryId: e.target.value, seats: prev.seats || presetSeats }));
              }}
            >
              <option value="">— Select Category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label font-semibold text-brand-900">Primary Branch *</label>
            <select
              className="input border-brand-300 font-medium"
              value={form.branchId}
              required
              onChange={(e) => {
                const newBranchId = e.target.value;
                setForm({ ...form, branchId: newBranchId });
                setUnitsList((prev) =>
                  prev.map((u) => ({
                    ...u,
                    current_branch_id: u.current_branch_id ?? (newBranchId ? Number(newBranchId) : null),
                  }))
                );
              }}
            >
              <option value="">— Select Branch * —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label font-semibold text-ink-900">Primary Vehicle Plate No. *</label>
            <input
              className="input uppercase font-mono font-semibold tracking-wider"
              placeholder="e.g. KA-46-M-5566"
              value={form.registrationNo}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setForm({ ...form, registrationNo: val });
                handleUnitChange(0, "registration_no", val);
              }}
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label font-semibold">Fleet Total Inventory Units *</label>
            <input
              className="input font-semibold text-base"
              type="number"
              min="1"
              max="100"
              value={form.totalUnits}
              onChange={(e) => setForm({ ...form, totalUnits: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Engine CC</label>
            <input className="input" type="number" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
          </div>
          <div>
            <label className="label">Fuel Type</label>
            <select className="input" value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })}>
              {["Petrol", "Diesel", "Electric", "CNG"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Transmission</label>
            <select className="input" value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })}>
              {["Manual", "Automatic"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-200 pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-ink-900 flex items-center gap-2">
                <span>🚗</span> Physical Fleet Units Registration &amp; Branch Allocation ({unitsList.length} Units)
              </h3>
              <p className="text-xs text-ink-600 mt-0.5">
                Enter each physical vehicle's registration plate number and designate which branch holds each unit.
              </p>
            </div>
            <span className="badge bg-brand-500 text-ink-950 font-bold self-start sm:self-auto">
              {unitsList.length} Total Units
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {unitsList.map((unit, idx) => (
              <div
                key={unit.id ?? `unit-${idx}`}
                className="grid gap-3 sm:grid-cols-12 items-center rounded-xl border border-ink-200 bg-white p-3 shadow-2xs hover:border-brand-300 transition"
              >
                <div className="sm:col-span-1 flex items-center gap-1.5 font-mono text-xs font-bold text-ink-500">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-ink-800 text-[11px]">
                    #{idx + 1}
                  </span>
                </div>

                <div className="sm:col-span-3">
                  <label className="label text-[10px] uppercase font-bold text-ink-400 mb-0.5">Unit Identifier</label>
                  <input
                    className="input text-xs font-mono font-semibold py-1.5"
                    value={unit.unit_identifier}
                    placeholder="e.g. LEXUS-001"
                    onChange={(e) => handleUnitChange(idx, "unit_identifier", e.target.value.toUpperCase())}
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="label text-[10px] uppercase font-bold text-ink-400 mb-0.5">
                    Registration Plate No. {idx === 0 && "*"}
                  </label>
                  <input
                    className="input text-xs font-mono font-bold uppercase tracking-wider py-1.5 text-brand-900 bg-brand-50/20"
                    placeholder="e.g. KA-46-M-5566"
                    value={unit.registration_no}
                    onChange={(e) => handleUnitChange(idx, "registration_no", e.target.value.toUpperCase())}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="label text-[10px] uppercase font-bold text-ink-400 mb-0.5">Designated Branch *</label>
                  <select
                    className="input text-xs font-semibold py-1.5"
                    value={unit.current_branch_id ?? ""}
                    onChange={(e) => handleUnitChange(idx, "current_branch_id", Number(e.target.value) || null)}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="label text-[10px] uppercase font-bold text-ink-400 mb-0.5">Unit Status</label>
                  <select
                    className="input text-xs font-medium py-1.5"
                    value={unit.status}
                    onChange={(e) => handleUnitChange(idx, "status", e.target.value)}
                  >
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                    <option value="booked">Booked</option>
                    <option value="blocked">Blocked</option>
                    <option value="transit">In Transit</option>
                  </select>
                </div>

                {unit.status !== "available" && (
                  <div className="sm:col-span-12">
                    <label className="label text-[10px] uppercase font-bold text-amber-700 mb-0.5">
                      Reason (required) — this removes {unit.unit_identifier || "the unit"} from every future date, not just today
                    </label>
                    <input
                      className="input text-xs py-1.5 border-amber-300"
                      value={unit.notes}
                      placeholder="e.g. Engine service, back Friday"
                      onChange={(e) => handleUnitChange(idx, "notes", e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Mileage</label>
            <input className="input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} placeholder="e.g. 20 km/l" />
          </div>
          <div>
            <label className="label">Included km / day</label>
            <input className="input" type="number" value={form.includedKm} onChange={(e) => setForm({ ...form, includedKm: e.target.value })} />
          </div>
          <div>
            <label className="label">Extra km rate (₹)</label>
            <input className="input" type="number" value={form.extraKmRate} onChange={(e) => setForm({ ...form, extraKmRate: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">24-hour rate (₹) *</label>
            <input className="input font-bold" type="number" value={form.rate24h} onChange={(e) => setForm({ ...form, rate24h: e.target.value })} />
          </div>
          <div>
            <label className="label">Hourly extension (₹)</label>
            <input className="input" type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Security deposit (₹)</label>
            <input className="input" type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
          </div>
          <div>
            <label className="label">Late fee / hour (₹)</label>
            <input className="input" type="number" value={form.lateFeePerHour} onChange={(e) => setForm({ ...form, lateFeePerHour: e.target.value })} />
          </div>
          <div>
            <label className="label font-semibold text-ink-900">Overall Fleet Status</label>
            <select className="input font-medium" value={form.status} onChange={(e) => handleOverallStatusChange(e.target.value)}>
              <option value={KEEP_UNIT_STATUS}>No change — manage each unit below</option>
              <option value="available">Available (Active Fleet)</option>
              <option value="unavailable">Unavailable (All Units Blocked)</option>
              <option value="booked">Booked (On Rental)</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {(form.status === "unavailable" || form.status === "blocked") && (
          <div>
            <label className="label text-amber-700">
              Reason (required) — takes every unit offline, on every future date, not just today
            </label>
            <input
              className="input border-amber-300"
              value={form.overallReason}
              placeholder="e.g. Fleet-wide inspection"
              onChange={(e) => setForm({ ...form, overallReason: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className="label">Description</label>
          <textarea className="input h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <label className="label">Primary Photo</label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="file"
              accept="image/*"
              className="text-xs text-ink-600 file:mr-3 file:rounded-lg file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-800 hover:file:bg-ink-50"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
            {uploading && <span className="text-xs text-ink-500 font-medium">Compressing &amp; uploading photo…</span>}
            {photoUrl && <span className="text-xs text-emerald-700 font-semibold">✓ Photo ready</span>}
          </div>
        </div>

        <div className="border-t border-ink-100 pt-3">
          <p className="label mb-2 font-bold text-ink-700">
            {vehicle && vehicle.photos && vehicle.photos.length > 0 ? "Saved Vehicle Photos" : "Category Preset Default Image"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {vehicle && vehicle.photos && vehicle.photos.length > 0 ? (
              vehicle.photos.map((p, idx) => (
                <img key={idx} src={p} alt="" className="h-16 w-24 rounded-lg object-cover border border-ink-200 shadow-xs" />
              ))
            ) : (
              <div className="flex items-center gap-3">
                <img
                  src={getCategoryPresetPhoto(
                    categories.find((c) => String(c.id) === String(form.categoryId))?.name,
                    form.name
                  )}
                  alt="Category Preset"
                  className="h-16 w-24 rounded-lg object-cover border border-ink-200 shadow-xs"
                />
                <span className="text-xs text-ink-500 font-medium">
                  Auto-assigned preset ({categories.find((c) => String(c.id) === String(form.categoryId))?.name || "Car"})
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-ink-100">
          <button type="submit" disabled={pending || uploading} className="btn-primary">
            {pending ? "Saving…" : vehicle ? "Save Changes" : "Create Vehicle & Register Units"}
          </button>
          {vehicle && (
            <button
              type="button"
              disabled={pending}
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition"
            >
              🗑️ Delete Vehicle
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
