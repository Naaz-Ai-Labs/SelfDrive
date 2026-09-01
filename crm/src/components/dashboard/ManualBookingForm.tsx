"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualBooking } from "@/lib/actions";
import { compressImageFile } from "@/lib/image-compression";

/** Same format the web checkout enforces (BookingForm.tsx's formatDlNumber). */
function formatDlNumber(val: string): string {
  const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)} ${clean.slice(4, 15)}`;
}

type DocState = Record<string, { url: string; number?: string; expiry?: string }>;

/** The driver's three documents, exactly as the web checkout's step 4 requires them.
 * Pillion documents stay optional — most rides are solo. */
const DOC_FIELDS: Array<[string, string]> = [
  ["licence", "Driver Driving licence photo *"],
  ["driver_govt_id", "Driver Government ID (Aadhaar/Passport) *"],
  ["driver_photo", "Driver Passport Size Photo *"],
  ["pillion_id", "Pillion ID Proof (Aadhaar/Passport) — optional"],
  ["pillion_photo", "Pillion Passport Size Photo — optional"],
];

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
/** datetime-local wants local wall-clock, not an ISO/UTC string. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

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
  const [mode, setMode] = useState<"scheduled" | "instant">("scheduled");
  const [startOdometer, setStartOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const instant = mode === "instant";

  // Same requirement the website enforces at checkout (BookingForm.tsx step 4) — a
  // counter booking is not exempt just because staff took it in person.
  const [documents, setDocuments] = useState<DocState>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const kycComplete = Boolean(documents.licence?.url && documents.driver_govt_id?.url && documents.driver_photo?.url);

  async function upload(kind: string, file: File) {
    setUploading(kind);
    setUploadErrors((e) => ({ ...e, [kind]: "" }));
    try {
      const compressed = await compressImageFile(file, 1600, 0.8);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("folder", "documents");
      const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (!res.ok || !res.path) throw new Error(res.error || "Upload failed. Please try again or use a smaller image.");
      setDocuments((d) => ({ ...d, [kind]: { ...d[kind], url: res.path } }));
    } catch (err) {
      setUploadErrors((e) => ({ ...e, [kind]: err instanceof Error ? err.message : "Upload failed. Please try again." }));
    } finally {
      setUploading(null);
    }
  }

  const selected = useMemo(
    () => vehicles.find((v) => String(v.id) === vehicleId),
    [vehicles, vehicleId]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");

    if (!vehicleId) return setError("Select a vehicle.");
    // Instant: the customer is taking it now, so pickup is now by definition.
    const effectivePickup = instant ? toLocalInput(new Date()) : pickupAt;
    if (!effectivePickup || !returnAt) return setError("Enter the return date/time.");
    if (new Date(returnAt) <= new Date(effectivePickup)) return setError("Return must be after pickup.");
    if (instant && !startOdometer.trim()) {
      return setError("Enter the odometer reading - without it, extra km cannot be billed when the vehicle comes back.");
    }
    if (name.trim().length < 2) return setError("Enter the customer name.");
    if (!/^[+\d][\d\s-]{8,15}$/.test(phone.trim())) return setError("Enter a valid mobile number.");
    if (!kycComplete) {
      return setError("Upload the driver's licence, government ID and passport-size photo before creating the booking.");
    }
    const dlNumber = documents.licence?.number?.trim() ?? "";
    if (!/^[A-Z]{2}\d{2} \d{11}$/.test(dlNumber)) {
      return setError("Enter the driver licence number in the format KA04 12345678901.");
    }
    const dlExpiry = documents.licence?.expiry ?? "";
    if (!dlExpiry) {
      return setError("Enter the driver licence expiry date.");
    }
    if (dlExpiry < returnAt.slice(0, 10)) {
      return setError("The driver's licence expires before the return date. A licence valid through the rental is required.");
    }

    startTransition(async () => {
      const docPayload = Object.entries(documents)
        .filter(([, d]) => d.url)
        .map(([kind, d]) => ({ kind, url: d.url, number: d.number, expiry: d.expiry }));

      const res = await createManualBooking({
        vehicleId: Number(vehicleId),
        pickupAt: effectivePickup,
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
        instant,
        startOdometer: startOdometer ? Number(startOdometer) : undefined,
        fuelLevel: fuelLevel || undefined,
        documents: docPayload,
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

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("scheduled")} disabled={pending}
          className={"rounded-full px-4 py-1.5 text-xs font-semibold transition " + (!instant ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200")}>
          Scheduled booking
        </button>
        <button type="button" onClick={() => setMode("instant")} disabled={pending}
          className={"rounded-full px-4 py-1.5 text-xs font-semibold transition " + (instant ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200")}>
          Instant - vehicle leaving now
        </button>
      </div>
      {instant && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Pickup is set to now and the vehicle is handed over as soon as this is saved:
          the unit is marked out and the booking goes straight to Vehicle handed over.
          The odometer reading is required so extra km can be billed on return.
        </p>
      )}

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
        {instant ? (
          <div>
            <label className="label">Pickup</label>
            <input className="input bg-ink-50" value="Now" readOnly disabled />
          </div>
        ) : (
          <div>
            <label className="label">Pickup *</label>
            <input className="input" type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} disabled={pending} />
          </div>
        )}
        <div>
          <label className="label">Return *</label>
          <input className="input" type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} disabled={pending} />
        </div>
      </div>

      {instant && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Odometer at handover *</label>
            <input className="input" type="number" min="0" value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} disabled={pending} />
          </div>
          <div>
            <label className="label">Fuel level</label>
            <input className="input" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)} placeholder="e.g. Half" disabled={pending} />
          </div>
        </div>
      )}

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

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-900">Driving licence &amp; documents</h3>
        <p className="text-[11px] text-ink-500">
          The driver&rsquo;s three documents are required for handover verification, same as an online
          booking. Pillion documents are optional — add them only if someone is riding along.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOC_FIELDS.map(([kind, label]) => (
            <label
              key={kind}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4 text-center text-xs text-ink-500 hover:border-brand-500"
            >
              {documents[kind]?.url ? (
                <span className="font-semibold text-emerald-700">✓ {label.replace(" *", "")} uploaded</span>
              ) : (
                <span>{uploading === kind ? "Uploading…" : `Upload ${label}`}</span>
              )}
              {uploadErrors[kind] && <span className="text-[11px] font-medium text-red-600">{uploadErrors[kind]} Tap to retry.</span>}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    upload(kind, file).catch(console.error);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Driver licence number *</label>
            <input
              className="input font-mono uppercase"
              placeholder="e.g. KA04 12345678901"
              maxLength={16}
              value={documents.licence?.number ?? ""}
              disabled={pending}
              onChange={(e) => {
                const val = formatDlNumber(e.target.value);
                setDocuments((d) => ({ ...d, licence: { ...d.licence, url: d.licence?.url ?? "", number: val } }));
              }}
            />
            <p className="mt-1 text-[11px] text-ink-400">Format: 2 letters, 2 digits, space, 11 digits (e.g. KA04 12345678901)</p>
          </div>
          <div>
            <label className="label">Driver licence expiry date *</label>
            <input
              className="input"
              type="date"
              value={documents.licence?.expiry ?? ""}
              disabled={pending}
              onChange={(e) => setDocuments((d) => ({ ...d, licence: { ...d.licence, url: d.licence?.url ?? "", expiry: e.target.value } }))}
            />
          </div>
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
        <button type="submit" disabled={pending || Boolean(uploading)} className="btn-primary text-sm font-semibold px-5 py-2">
          {pending ? "Creating booking..." : instant ? "Create and hand over now" : "Create counter booking"}
        </button>
      </div>
    </form>
  );
}
