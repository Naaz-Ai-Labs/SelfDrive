"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createManualEnquiry, changeEnquiryStage, assignEnquiry, addEnquiryNote,
  updateBookingStatus, assignBookingManager, approveAfterHours, addManualAdjustment,
  recordInspection, addDamageReport, addPayment, markPaymentPaid,
  decideRefund, completeRefund, updateProblemTicket,
} from "@/lib/actions";
import { compressImageFile } from "@/lib/image-compression";
import { VehicleCameraScanner, type CapturedPhoto } from "./VehicleCameraScanner";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function run(fn: () => Promise<{ ok?: boolean; error?: string } | void>) {
    setError("");
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && "error" in res && res.error) setError(res.error);
        else router.refresh();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }
  return { pending, error, run, setError };
}

export function CreateEnquiryForm({ categories }: { categories: Array<{ id: number; name: string }> }) {
  const { pending, error, run } = useAction();
  const [form, setForm] = useState({ name: "", phone: "", email: "", categoryId: "", location: "", pickupDate: "", returnDate: "", passengers: "", source: "Phone call", notes: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Enter the customer name.";
    if (!/^[+\d][\d\s-]{8,15}$/.test(form.phone.trim())) next.phone = "Enter a valid mobile number.";
    setErrs(next);
    if (Object.keys(next).length > 0) return;
    run(async () => {
      await createManualEnquiry({
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : null, location: form.location || undefined,
        pickupDate: form.pickupDate || undefined, returnDate: form.returnDate || undefined,
        passengers: form.passengers ? Number(form.passengers) : undefined, source: form.source, notes: form.notes.trim() || undefined,
      });
      setForm({ name: "", phone: "", email: "", categoryId: "", location: "", pickupDate: "", returnDate: "", passengers: "", source: "Phone call", notes: "" });
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ce-name">Customer name *</label>
          <input id="ce-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errs.name} />
          {errs.name && <p className="field-error">{errs.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="ce-phone">Mobile number *</label>
          <input id="ce-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={!!errs.phone} />
          {errs.phone && <p className="field-error">{errs.phone}</p>}
        </div>
        <div>
          <label className="label" htmlFor="ce-email">Email</label>
          <input id="ce-email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ce-cat">Vehicle type</label>
          <select id="ce-cat" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— Select —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ce-loc">Pickup location</label>
          <input id="ce-loc" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ce-pax">Passengers</label>
          <input id="ce-pax" className="input" type="number" min={1} value={form.passengers} onChange={(e) => setForm({ ...form, passengers: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ce-pickup">Pickup date</label>
          <input id="ce-pickup" className="input" type="date" value={form.pickupDate} onChange={(e) => setForm({ ...form, pickupDate: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ce-return">Return date</label>
          <input id="ce-return" className="input" type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ce-source">Source</label>
          <select id="ce-source" className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {["Phone call", "WhatsApp", "Walk-in", "Referral", "Instagram", "Google", "Other"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ce-notes">Notes</label>
        <textarea id="ce-notes" className="input min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Creating…" : "Create enquiry"}</button>
    </form>
  );
}

export function EnquiryStageSelect({ enquiryId, stages, current }: { enquiryId: number; stages: string[]; current: string }) {
  const { pending, run } = useAction();
  return (
    <select className="input w-auto" value={current} disabled={pending} onChange={(e) => run(() => changeEnquiryStage(enquiryId, e.target.value))} aria-label="Change enquiry stage">
      {stages.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}

export function EnquiryAssignSelect({ enquiryId, staff, current }: { enquiryId: number; staff: Array<{ id: number; name: string }>; current: number | null }) {
  const { pending, run } = useAction();
  return (
    <select className="input w-auto" value={current ?? ""} disabled={pending} onChange={(e) => run(() => assignEnquiry(enquiryId, e.target.value ? Number(e.target.value) : null))} aria-label="Assign staff">
      <option value="">Unassigned</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function EnquiryNoteForm({ enquiryId }: { enquiryId: number }) {
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (note.trim().length < 2) return;
    run(async () => { await addEnquiryNote(enquiryId, note.trim()); setNote(""); });
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Add note</button>
    </form>
  );
}

export function BookingStatusSelect({ bookingId, statuses, current }: { bookingId: number; statuses: string[]; current: string }) {
  const { pending, run } = useAction();
  return (
    <select className="input w-auto" value={current} disabled={pending} onChange={(e) => run(() => updateBookingStatus(bookingId, e.target.value))} aria-label="Change booking status">
      {statuses.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}

export function BookingManagerSelect({ bookingId, staff, current }: { bookingId: number; staff: Array<{ id: number; name: string }>; current: number | null }) {
  const { pending, run } = useAction();
  return (
    <select className="input w-auto" value={current ?? ""} disabled={pending} onChange={(e) => run(() => assignBookingManager(bookingId, e.target.value ? Number(e.target.value) : null))} aria-label="Assign manager">
      <option value="">Unassigned</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function AfterHoursApproval({ bookingId }: { bookingId: number }) {
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-800">This booking has an after-hours pickup and needs approval.</p>
      <input className="input" placeholder="Optional note / surcharge explanation" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => approveAfterHours(bookingId, true, note || undefined))} className="btn-primary px-4 py-2 text-xs">Approve</button>
        <button type="button" disabled={pending} onClick={() => run(() => approveAfterHours(bookingId, false, note || undefined))} className="btn-secondary px-4 py-2 text-xs">Decline</button>
      </div>
    </div>
  );
}

const PHOTO_SIDES = ["front", "rear", "left", "right", "odometer", "fuel", "damage"] as const;

export function InspectionForm({ bookingId, kind }: { bookingId: number; kind: "handover" | "return" }) {
  const { pending, error, run } = useAction();
  const [odometer, setOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState("Full");
  const [notes, setNotes] = useState("");
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, CapturedPhoto>>({});

  const handlePhotoCaptured = (photo: CapturedPhoto) => {
    setCapturedPhotos((prev) => ({ ...prev, [photo.side]: photo }));
  };

  const handleRemovePhoto = (side: string) => {
    setCapturedPhotos((prev) => {
      const next = { ...prev };
      delete next[side];
      return next;
    });
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const mandatoryKeys = ["front", "rear", "left", "right"];
    const missingKeys = mandatoryKeys.filter((k) => !capturedPhotos[k]?.url);

    if (missingKeys.length > 0) {
      if (!confirm(`Missing mandatory scans for: ${missingKeys.join(", ").toUpperCase()}. Are you sure you want to proceed without all 4 vehicle sides?`)) {
        return;
      }
    }

    run(async () => {
      const photoPayload = Object.values(capturedPhotos).map((p) => ({
        side: p.side,
        url: p.url,
        notes: p.notes,
      }));

      const res = await recordInspection({
        bookingId,
        kind,
        odometer: odometer ? Number(odometer) : undefined,
        fuelLevel,
        notes: notes || undefined,
        photos: photoPayload,
      });
      return res;
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Odometer reading (km)</label>
          <input className="input" type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="e.g. 24500" />
        </div>
        <div>
          <label className="label">Fuel level</label>
          <select className="input" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)}>
            {["Full", "3/4", "1/2", "1/4", "Empty"].map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Inspection notes</label>
        <textarea className="input min-h-14" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Existing scratches, clean interior, tire condition, etc." />
      </div>

      {/* Live Camera Scanner & Geotagged Photo Capture */}
      <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-sm">
        <VehicleCameraScanner
          capturedPhotos={capturedPhotos}
          onPhotoCaptured={handlePhotoCaptured}
          onRemovePhoto={handleRemovePhoto}
        />
      </div>

      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-2.5 text-xs font-semibold shadow">
        {pending ? "Saving Inspection Record..." : kind === "handover" ? "✓ Record Handover Inspection" : "✓ Record Return Inspection & Calculate Charges"}
      </button>
    </form>
  );
}

export function ManualAdjustmentForm({ bookingId }: { bookingId: number }) {
  const [type, setType] = useState("late_fee_change");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { pending, error, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !amount) return;
    run(async () => {
      await addManualAdjustment({ bookingId, type, amount: Number(amount), reason: reason.trim() });
      setAmount(""); setReason("");
    });
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {[["late_fee_change", "Late fee change"], ["late_fee_waiver", "Late fee waiver"], ["price_override", "Price override"], ["discount", "Discount"], ["damage_charge", "Damage charge"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input" type="number" placeholder="Amount (₹, use negative to reduce)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-secondary px-4 py-2 text-xs">Record adjustment</button>
    </form>
  );
}

export function DamageReportForm({ bookingId }: { bookingId: number }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { pending, error, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    run(async () => {
      await addDamageReport({ bookingId, description: description.trim(), chargeAmount: Number(amount) || 0 });
      setDescription(""); setAmount("");
    });
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
        <input className="input" placeholder="Damage description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" type="number" placeholder="Charge ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-secondary px-4 py-2 text-xs">Add damage report</button>
    </form>
  );
}

export function PaymentForm({ bookingId }: { bookingId: number }) {
  const [form, setForm] = useState({ amount: "", kind: "advance", method: "UPI", dueDate: "", notes: "" });
  const { pending, error, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    run(async () => {
      await addPayment({ bookingId, amount, kind: form.kind, method: form.method, dueDate: form.dueDate || undefined, notes: form.notes || undefined });
      setForm({ ...form, amount: "", notes: "" });
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Amount *</label>
          <input className="input" type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Kind</label>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {["advance", "full", "deposit", "extra_charge"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {["UPI", "Card", "Cash", "Net banking", "Wallet"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Add payment entry</button>
    </form>
  );
}

export function MarkPaidButton({ id }: { id: number }) {
  const { pending, run } = useAction();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => markPaymentPaid(id))} className="btn-primary px-4 py-2 text-xs">
      {pending ? "…" : "Mark as paid"}
    </button>
  );
}

export function RefundDecisionForm({ id, requested }: { id: number; requested: number }) {
  const [amount, setAmount] = useState(String(requested));
  const [notes, setNotes] = useState("");
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Approved amount" />
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Admin notes" />
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => decideRefund(id, "Approved", Number(amount), notes || undefined))} className="btn-primary px-4 py-2 text-xs">Approve</button>
        <button type="button" disabled={pending} onClick={() => run(() => decideRefund(id, "Partially approved", Number(amount), notes || undefined))} className="btn-secondary px-4 py-2 text-xs">Partial approve</button>
        <button type="button" disabled={pending} onClick={() => run(() => decideRefund(id, "Rejected", 0, notes || undefined))} className="btn-secondary px-4 py-2 text-xs">Reject</button>
      </div>
    </div>
  );
}

export function CompleteRefundForm({ id }: { id: number }) {
  const [method, setMethod] = useState("UPI");
  const [ref, setRef] = useState("");
  const { pending, error, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return;
    run(() => completeRefund(id, method, ref.trim()));
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <select className="input w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
        {["UPI", "Bank transfer", "Card reversal", "Cash"].map((m) => <option key={m}>{m}</option>)}
      </select>
      <input className="input w-auto" placeholder="Transaction reference" value={ref} onChange={(e) => setRef(e.target.value)} />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Mark refund completed</button>
    </form>
  );
}

export function ProblemTicketForm({
  id, staff, vehicles, currentStatus, currentAssignee, currentReplacement, currentNotes,
}: {
  id: number;
  staff: Array<{ id: number; name: string }>;
  vehicles: Array<{ id: number; name: string }>;
  currentStatus?: string;
  currentAssignee?: number | null;
  currentReplacement?: number | null;
  currentNotes?: string | null;
}) {
  const { pending, error, run } = useAction();
  const [status, setStatus] = useState(currentStatus ?? "");
  const [assignee, setAssignee] = useState(currentAssignee ? String(currentAssignee) : "");
  const [replacement, setReplacement] = useState(currentReplacement ? String(currentReplacement) : "");
  const [notes, setNotes] = useState(currentNotes ?? "");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => updateProblemTicket(id, {
      status: status || undefined,
      assignedTo: assignee ? Number(assignee) : undefined,
      replacementVehicleId: replacement ? Number(replacement) : undefined,
      resolutionNotes: notes || undefined,
    }));
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Change status…</option>
          {["Open", "In progress", "Resolved", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Assign to…</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input" value={replacement} onChange={(e) => setReplacement(e.target.value)}>
          <option value="">Replacement vehicle…</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <textarea className="input min-h-14" placeholder="Resolution notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Update ticket</button>
    </form>
  );
}
