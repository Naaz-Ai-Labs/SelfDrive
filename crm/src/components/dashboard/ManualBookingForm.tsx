"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualBooking } from "@/lib/actions";

type VehicleOption = {
  id: number;
  name: string;
  registration_no: string | null;
  rate_24h: number;
  deposit: number;
  available_units: number;
};

type BranchOption = { id: number; name: string };

/** Counter booking: a customer in front of staff, no online checkout.
 *
 * Availability is NOT decided here. The server claims a physical unit atomically
 * through the same reservation RPC the website uses, so two staff members (or a
 * staff member and a website customer) racing for the last unit cannot both win.
 * This form only collects what that call needs. */
export function ManualBookingForm({
  vehicles,
  branches,
}: {
  vehicles: VehicleOption[];
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const [vehicleId, setVehicleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const selected = useMemo(
    () => vehicles.find((v) => String(v.id) === vehicleId),
    [vehicles, vehicleId]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");

    if (!vehicleId) return setError("Select a vehicle.");
    if (!pickupAt || !returnAt) return setError("Enter both pickup and return date/time.");
    if (new Date(returnAt) <= new Date(pickupAt)) return setError("Return must be after pickup.");
    if (name.trim().length < 2) return setError("Enter the customer name.");
    if (!/^[+\d][\d\s-]{8,15}$/.test(phone.trim())) return setError("Enter a valid mobile number.");

    startTransition(async () => {
      const res = await createManualBooking({
        vehicleId: Number(vehicleId),
        pickupAt,
        returnAt,
        branchId: branchId ? Number(branchId) : undefined,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        },
        notes: notes.trim() || undefined,
        amountCollected: amountCollected ? Number(amountCollected) : undefined,
        paymentMethod,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("warning" in res && res.warning) setWarning(res.warning);
      router.push("/dashboard/bookings/" + res.bookingId);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</div>}
      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">{warning}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Vehicle *</label>
          <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={pending}>
            <option value="">Select a vehicle...</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{v.registration_no ? " - " + v.registration_no : ""} (Rs {v.rate_24h}/24h)
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-[11px] text-ink-500">
              Rs {selected.rate_24h}/24h, deposit Rs {selected.deposit}, {selected.available_units} unit(s) free now
            </p>
          )}
        </div>
        <div>
          <label className="label">Pickup branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={pending}>
            <option value="">Vehicle default branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Pickup *</label>
          <input className="input" type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} disabled={pending} />
        </div>
        <div>
          <label className="label">Return *</label>
          <input className="input" type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} disabled={pending} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Customer name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </div>
        <div>
          <label className="label">Mobile *</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." disabled={pending} />
          <p className="mt-1 text-[11px] text-ink-500">Matches an existing customer by number, or creates one.</p>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} disabled={pending} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Collected now (Rs)</label>
          <input className="input" type="number" min="0" value={amountCollected} onChange={(e) => setAmountCollected(e.target.value)} disabled={pending} />
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={pending}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Card</option>
            <option>Bank transfer</option>
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
        </div>
      </div>

      <p className="text-[11px] text-ink-500">
        The vehicle is reserved the moment this is saved, using the same atomic claim the
        website uses, so a counter booking cannot double-book a unit. Leave the amount
        blank to record payment later from the booking page.
      </p>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm font-semibold px-5 py-2">
          {pending ? "Creating booking..." : "Create counter booking"}
        </button>
      </div>
    </form>
  );
}
