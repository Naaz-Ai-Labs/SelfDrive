"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVehicle, addVehiclePhoto } from "@/lib/actions";
import type { Vehicle } from "@/lib/data";

export function VehicleForm({ categories, branches, vehicle }: {
  categories: Array<{ id: number; name: string }>;
  branches: Array<{ id: number; name: string }>;
  vehicle?: Vehicle;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: vehicle?.name ?? "", brand: vehicle?.brand ?? "", model: vehicle?.model ?? "", year: vehicle?.year ? String(vehicle.year) : "",
    categoryId: vehicle?.category_id ? String(vehicle.category_id) : "", branchId: vehicle?.branch_id ? String(vehicle.branch_id) : "",
    registrationNo: vehicle?.registration_no ?? "", cc: vehicle?.cc ? String(vehicle.cc) : "", fuelType: vehicle?.fuel_type ?? "Petrol",
    transmission: vehicle?.transmission ?? "Manual", seats: vehicle ? String(vehicle.seats) : "5", mileage: vehicle?.mileage ?? "",
    includedKm: vehicle ? String(vehicle.included_km) : "100", extraKmRate: vehicle ? String(vehicle.extra_km_rate) : "5",
    rate12h: vehicle ? String(vehicle.rate_12h) : "", rate24h: vehicle ? String(vehicle.rate_24h) : "", hourlyRate: vehicle ? String(vehicle.hourly_rate) : "",
    deposit: vehicle ? String(vehicle.deposit) : "2000", lateFeePerHour: vehicle ? String(vehicle.late_fee_per_hour) : "150",
    description: vehicle?.description ?? "", status: vehicle?.status ?? "available",
  });
  const [photoUrl, setPhotoUrl] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.brand.trim() || !form.model.trim()) {
      setError("Name, brand and model are required.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await saveVehicle({
          id: vehicle?.id, name: form.name.trim(), brand: form.brand.trim(), model: form.model.trim(),
          year: form.year ? Number(form.year) : undefined, categoryId: form.categoryId ? Number(form.categoryId) : null,
          branchId: form.branchId ? Number(form.branchId) : null, registrationNo: form.registrationNo || undefined,
          cc: form.cc ? Number(form.cc) : undefined, fuelType: form.fuelType, transmission: form.transmission,
          seats: Number(form.seats) || 2, mileage: form.mileage || undefined, includedKm: Number(form.includedKm) || 100,
          extraKmRate: Number(form.extraKmRate) || 0, rate12h: Number(form.rate12h) || 0, rate24h: Number(form.rate24h) || 0,
          hourlyRate: Number(form.hourlyRate) || 0, deposit: Number(form.deposit) || 0, lateFeePerHour: Number(form.lateFeePerHour) || 0,
          description: form.description || undefined, status: form.status, active: true,
        });
        router.refresh();
        if (!vehicle) setForm({ ...form, name: "", brand: "", model: "", registrationNo: "" });
      } catch {
        setError("Could not save vehicle.");
      }
    });
  }

  function addPhoto() {
    if (!photoUrl.trim() || !vehicle?.id) return;
    startTransition(async () => {
      await addVehiclePhoto(vehicle.id, photoUrl.trim(), vehicle.photos.length === 0);
      setPhotoUrl("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Display name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Brand *</label><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
          <div><label className="label">Model *</label><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="label">Year</label><input className="input" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Branch</label>
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="label">Registration no.</label><input className="input" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="label">CC</label><input className="input" type="number" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} /></div>
          <div>
            <label className="label">Fuel type</label>
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
          <div><label className="label">Seats</label><input className="input" type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Mileage</label><input className="input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} placeholder="e.g. 20 km/l" /></div>
          <div><label className="label">Included km / day</label><input className="input" type="number" value={form.includedKm} onChange={(e) => setForm({ ...form, includedKm: e.target.value })} /></div>
          <div><label className="label">Extra km rate (₹)</label><input className="input" type="number" value={form.extraKmRate} onChange={(e) => setForm({ ...form, extraKmRate: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">12-hour rate (₹)</label><input className="input" type="number" value={form.rate12h} onChange={(e) => setForm({ ...form, rate12h: e.target.value })} /></div>
          <div><label className="label">24-hour rate (₹) *</label><input className="input" type="number" value={form.rate24h} onChange={(e) => setForm({ ...form, rate24h: e.target.value })} /></div>
          <div><label className="label">Hourly extension (₹)</label><input className="input" type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Security deposit (₹)</label><input className="input" type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
          <div><label className="label">Late fee / hour (₹)</label><input className="input" type="number" value={form.lateFeePerHour} onChange={(e) => setForm({ ...form, lateFeePerHour: e.target.value })} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {["available", "booked", "maintenance", "archived"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Description</label><textarea className="input min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : vehicle ? "Save changes" : "Add vehicle"}</button>
      </form>

      {vehicle && (
        <div className="border-t border-ink-100 pt-4">
          <p className="label mb-2">Photos</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {vehicle.photos.map((p) => <img key={p} src={p} alt="" className="h-16 w-24 rounded-lg object-cover" />)}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
            <button type="button" onClick={addPhoto} disabled={pending} className="btn-secondary px-4 py-2 text-xs shrink-0">Add photo</button>
          </div>
        </div>
      )}
    </div>
  );
}
