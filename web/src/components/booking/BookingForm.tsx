"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatINR, formatDate, formatTimeLabel, waLink } from "@/lib/utils";
import { saveBookingDraft, getDraft, submitBooking, getAvailableVehicles, getQuoteEstimate, getVehicleById } from "@/lib/booking-actions";
import { RazorpayCheckout } from "./RazorpayCheckout";
import type { Vehicle } from "@/lib/data";

type Category = { id: number; name: string; kind: string; icon: string | null };
type Quote = Awaited<ReturnType<typeof getQuoteEstimate>>;

const STEP_LABELS = ["Rental period", "Choose vehicle", "Your details", "Documents", "Review & confirm", "Payment"];
const STANDARD_PICKUP_TIME = "08:00";

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function combineIso(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}`;
}

export function BookingForm({ categories, businessWhatsapp, terms }: { categories: Category[]; businessWhatsapp: string; terms: string[] }) {
  const router = useRouter();
  const search = useSearchParams();
  // Arriving with a vehicle already picked (from a vehicle detail page) should
  // land the user on the vehicle-confirmation step, not make them start over.
  const [step, setStep] = useState(search.get("vehicle") && !search.get("resume") ? 2 : 1);
  const [token, setToken] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [categoryKind, setCategoryKind] = useState(search.get("kind") ?? "");
  const [location, setLocation] = useState("");
  const [pickupDate, setPickupDate] = useState(search.get("pickup") ?? todayISO());
  const [pickupTime, setPickupTime] = useState(search.get("pickupTime") ?? STANDARD_PICKUP_TIME);
  const [returnDate, setReturnDate] = useState(search.get("return") ?? todayISO());
  const [returnTime, setReturnTime] = useState(search.get("returnTime") ?? STANDARD_PICKUP_TIME);
  const [passengers, setPassengers] = useState("");

  const pickupAt = combineIso(pickupDate, pickupTime);
  const returnAt = combineIso(returnDate, returnTime);

  const days = useMemo(() => {
    const p = new Date(`${pickupDate}T${pickupTime}`);
    const r = new Date(`${returnDate}T${returnTime}`);
    const diffMs = r.getTime() - p.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) return 1;
    return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }, [pickupDate, pickupTime, returnDate, returnTime]);

  const [vehicleId, setVehicleId] = useState<number | null>(search.get("vehicle") ? Number(search.get("vehicle")) : null);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);

  const [contact, setContact] = useState({ name: "", phone: "", email: "", address: "", dob: "", emergencyContact: "" });
  const [documents, setDocuments] = useState<Record<string, { url: string; number?: string; expiry?: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ bookingId: number; bookingNo: string } | null>(null);
  const [paid, setPaid] = useState(false);

  // Resume from a draft token in the URL, or restore from localStorage.
  useEffect(() => {
    const resumeToken = search.get("resume");
    if (resumeToken) {
      getDraft(resumeToken).then((draft) => {
        if (!draft) return;
        setToken(resumeToken);
        setCategoryKind(String(draft.categoryId ?? categoryKind));
        setLocation(draft.location ?? "");
        if (draft.pickupAt) {
          const [d, t] = draft.pickupAt.split("T");
          setPickupDate(d ?? todayISO());
          setPickupTime(t ?? STANDARD_PICKUP_TIME);
        }
        if (draft.returnAt) {
          const [rd, rt] = draft.returnAt.split("T");
          setReturnDate(rd ?? todayISO());
          setReturnTime(rt ?? STANDARD_PICKUP_TIME);
        }
        setPassengers(draft.passengers ? String(draft.passengers) : "");
        setVehicleId(draft.vehicleId);
        setContact(draft.contact as typeof contact);
        setStep(draft.step || 1);
      });
      return;
    }
    const local = localStorage.getItem("darshh_booking_draft");
    if (local) {
      try {
        const draft = JSON.parse(local);
        if (!search.get("kind") && draft.categoryKind) setCategoryKind(draft.categoryKind);
        if (draft.location) setLocation(draft.location);
        if (!search.get("pickup") && draft.pickupDate) setPickupDate(draft.pickupDate);
        if (draft.pickupTime) setPickupTime(draft.pickupTime);
        if (!search.get("return") && draft.returnDate) setReturnDate(draft.returnDate);
        if (draft.returnTime) setReturnTime(draft.returnTime);
        if (draft.passengers) setPassengers(draft.passengers);
        if (!search.get("vehicle") && draft.vehicleId) setVehicleId(draft.vehicleId);
        if (draft.contact) setContact(draft.contact);
      } catch {
        // ignore corrupt draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (localStorage instantly, server debounced) whenever key fields change.
  useEffect(() => {
    localStorage.setItem("darshh_booking_draft", JSON.stringify({ categoryKind, location, pickupDate, pickupTime, returnDate, returnTime, passengers, vehicleId, contact }));
    if (!contact.name && !contact.phone && !vehicleId) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await saveBookingDraft({
          token, categoryId: null, vehicleId, pickupAt: pickupAt || null, returnAt: returnAt || null,
          location, passengers: passengers ? Number(passengers) : null, step, contact,
        });
        setToken(res.token);
        setSaveStatus("saved");
        setLastSaved(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
      } catch {
        setSaveStatus("error");
      }
    }, 1600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKind, location, pickupDate, pickupTime, returnDate, returnTime, passengers, vehicleId, contact, step]);

  // Load available vehicles when period/category changes (step 2).
  useEffect(() => {
    if (step !== 2) return;
    setLoadingVehicles(true);
    getAvailableVehicles(categoryKind || null, pickupAt || null, returnAt || null)
      .then(setAvailableVehicles)
      .finally(() => setLoadingVehicles(false));
  }, [step, categoryKind, pickupAt, returnAt]);

  // Live quote when vehicle + dates are known.
  useEffect(() => {
    if (!vehicleId || !pickupAt || !returnAt) { setQuote(null); return; }
    getQuoteEstimate(vehicleId, pickupAt, returnAt).then(setQuote);
  }, [vehicleId, pickupAt, returnAt]);

  // Fetched independently of the availability list, so the vehicle summary still
  // shows correctly even when arriving directly on a later step (resume link, etc.).
  const [fetchedVehicle, setFetchedVehicle] = useState<Vehicle | null>(null);
  useEffect(() => {
    if (!vehicleId) { setFetchedVehicle(null); return; }
    getVehicleById(vehicleId).then(setFetchedVehicle);
  }, [vehicleId]);

  const selectedVehicle = useMemo(
    () => availableVehicles.find((v) => v.id === vehicleId) ?? (fetchedVehicle?.id === vehicleId ? fetchedVehicle : undefined),
    [availableVehicles, vehicleId, fetchedVehicle]
  );
  const kycComplete = Boolean(documents.licence?.url && documents.govt_id?.url);

  function validateStep(n: number): boolean {
    const e: Record<string, string> = {};
    if (n === 1) {
      if (!pickupDate) e.pickupDate = "Please select a pickup date.";
      if (days < 1) e.days = "Minimum 1 day.";
      if (quote?.belowWeekendMinimum) e.days = `Weekend bookings need at least ${quote.weekendMinDays} days.`;
    }
    if (n === 2 && !vehicleId) e.vehicle = "Please select a vehicle.";
    if (n === 3) {
      if (contact.name.trim().length < 2) e.name = "Enter your full name.";
      if (!/^[+\d][\d\s-]{8,15}$/.test(contact.phone.trim())) e.phone = "Enter a valid mobile number.";
    }
    if (n === 4 && !kycComplete) e.documents = "Please upload your driving licence and a government ID — this is required before we can hand over a vehicle.";
    if (n === 5 && !termsAccepted) e.terms = "Please accept the terms and conditions to continue.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 6));
  }
  function back() { setStep((s) => Math.max(s - 1, 1)); }

  async function upload(kind: string, file: File) {
    setUploading(kind);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
    setUploading(null);
    if (res?.path) setDocuments((d) => ({ ...d, [kind]: { ...d[kind], url: res.path } }));
  }

  async function submit() {
    if (!validateStep(5) || !vehicleId) return;
    setSubmitting(true);
    setSubmitError("");
    const res = await submitBooking({
      token: token ?? "",
      vehicleId, pickupAt, returnAt, location, passengers: passengers ? Number(passengers) : null,
      contact, termsAccepted,
      documents: Object.entries(documents).filter(([, v]) => v.url).map(([kind, v]) => ({ kind, url: v.url, number: v.number, expiry: v.expiry })),
    });
    setSubmitting(false);
    if (!res.ok || !res.bookingId) { setSubmitError(res.error ?? "Something went wrong."); return; }
    localStorage.removeItem("darshh_booking_draft");
    setResult({ bookingId: res.bookingId, bookingNo: res.bookingNo! });
    setStep(6);
  }

  const resumeLink = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/booking?resume=${token}` : "";

  if (step === 6 && result) {
    return (
      <div className="mx-auto max-w-xl">
        {!paid ? (
          <div className="card p-6 sm:p-8">
            <h1 className="font-display text-2xl font-semibold text-ink-900">Booking received — {result.bookingNo}</h1>
            <p className="mt-2 text-sm text-ink-600">You can pay online now to confirm instantly, or pay at pickup — either way, your booking is held.</p>
            <div className="mt-6">
              <RazorpayCheckout
                bookingId={result.bookingId}
                amountDue={quote?.totalAmount ?? 0}
                customerName={contact.name}
                customerPhone={contact.phone}
                customerEmail={contact.email}
                onPaid={() => setPaid(true)}
                onPayLater={() => setPaid(true)}
              />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
            <h1 className="mt-6 font-display text-3xl font-semibold text-ink-900">You&apos;re all set!</h1>
            <p className="mt-3 text-ink-600">Your booking number is <strong>{result.bookingNo}</strong>. Our team will verify your documents and confirm your pickup.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a href={waLink(businessWhatsapp, `Hi, this is regarding my booking ${result.bookingNo}`)} target="_blank" rel="noopener noreferrer" className="btn-primary">Message us on WhatsApp</a>
              <Link href="/customer/login" className="btn-secondary">Track this booking</Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-400">
        {STEP_LABELS.slice(0, 5).map((label, i) => (
          <li key={label} className={`rounded-full px-3 py-1.5 ${step === i + 1 ? "bg-brand-500 text-ink-950" : step > i + 1 ? "bg-emerald-100 text-emerald-700" : "bg-ink-100"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mb-4 text-xs text-ink-400" aria-live="polite">
        {saveStatus === "saving" && "Saving…"}
        {saveStatus === "saved" && `Draft saved${lastSaved ? ` at ${lastSaved}` : ""}`}
        {saveStatus === "error" && "Unable to save — your progress is still kept on this device."}
        {resumeLink && saveStatus === "saved" && (
          <button type="button" className="ml-2 font-semibold text-brand-700 hover:underline" onClick={() => navigator.clipboard?.writeText(resumeLink)}>
            Copy resume link
          </button>
        )}
      </div>

      {/* Persistent reminder of what's being booked, once past vehicle selection —
          so the form fields never feel disconnected from the actual bike/car. */}
      {step >= 3 && selectedVehicle && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-sm">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-100">
            {selectedVehicle.primary_photo ? (
              <Image src={selectedVehicle.primary_photo} alt={selectedVehicle.name} fill className="object-cover" sizes="56px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-400" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M5 17a2 2 0 104 0M5 17V9l2-4h10l2 4v8M15 17a2 2 0 104 0" /></svg>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{selectedVehicle.name}</p>
            <p className="truncate text-xs text-ink-500">{days} day{days > 1 ? "s" : ""} · {formatDate(pickupAt)} → {formatDate(returnAt)}</p>
          </div>
          <button type="button" onClick={() => setStep(2)} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">Change</button>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">When and what do you need?</h2>
            <p className="text-sm text-ink-500">Standard rental day is 8:00 AM to 8:00 AM (24 hours complete cycle). Included drive limit is 100 km per day. Exceeding the limit costs ₹8 per extra KM. Early pickup (&le;7:59 AM) or late drop (&gt;8:00 PM) incurs an extra ₹250 fee.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Vehicle type</label>
                <select className="input" value={categoryKind} onChange={(e) => setCategoryKind(e.target.value)}>
                  <option value="">Any type</option>
                  {Array.from(new Map(categories.map((c) => [c.kind, c])).values()).map((c) => <option key={c.kind} value={c.kind}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Pickup location</label>
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Sakleshpura branch" />
              </div>

              <div>
                <label className="label">Pickup date *</label>
                <input className="input" type="date" min={todayISO()} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} aria-invalid={!!errors.pickupDate} />
                {errors.pickupDate && <p className="field-error">{errors.pickupDate}</p>}
              </div>
              <div>
                <label className="label">Pickup time</label>
                <select className="input" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                  {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"].map((t) => (
                    <option key={t} value={t}>{t === "08:00" ? "8:00 AM (Standard)" : formatTimeLabel(t)}</option>
                  ))}
                </select>
                {pickupTime <= "07:59" && <p className="mt-1 text-xs font-medium text-amber-700">Early pickup (7:59 AM or earlier) incurs an extra ₹250 fee.</p>}
              </div>

              <div>
                <label className="label">Drop date (Return date) *</label>
                <input className="input" type="date" min={pickupDate} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} aria-invalid={!!errors.returnDate} />
                {errors.returnDate && <p className="field-error">{errors.returnDate}</p>}
              </div>
              <div>
                <label className="label">Drop time (Return time)</label>
                <select className="input" value={returnTime} onChange={(e) => setReturnTime(e.target.value)}>
                  {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"].map((t) => (
                    <option key={t} value={t}>{t === "08:00" ? "8:00 AM (Standard 24h)" : formatTimeLabel(t)}</option>
                  ))}
                </select>
                {returnTime > "08:00" && <p className="mt-1 text-xs font-medium text-amber-700">Late drop-off (after 8:00 AM) incurs an extra ₹250 fee.</p>}
              </div>

              <div>
                <label className="label">Passengers (optional)</label>
                <input className="input" type="number" min={1} value={passengers} onChange={(e) => setPassengers(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-ink-500 font-medium">
              Calculated Duration: {days} day{days > 1 ? "s" : ""} · Standard Daily Limit: 100 km/day (Bikes) / 300 km/day (Cars) / Unlimited (Tempo) · Extra KM: ₹8/km
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">Choose your vehicle</h2>
            <p className="text-sm text-ink-500">{days} day{days > 1 ? "s" : ""}, from {formatDate(pickupAt)} to {formatDate(returnAt)}.</p>
            {loadingVehicles && <p className="text-sm text-ink-400">Checking availability…</p>}
            {!loadingVehicles && availableVehicles.length === 0 && <p className="text-sm text-ink-400">No vehicles available for this period. Try different dates.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {availableVehicles.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setVehicleId(v.id)}
                  className={`rounded-xl border p-4 text-left transition ${vehicleId === v.id ? "border-brand-500 bg-brand-50" : "border-ink-100 hover:border-ink-300"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-ink-900">{v.name}</p>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-xs ${v.total_units <= 2 ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                      {v.total_units ?? 1} Left
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">{v.transmission} · {v.fuel_type} · {v.included_km >= 999 ? "Unlimited KM" : `${v.included_km} km/day`}</p>
                  <p className="mt-2 font-display text-lg font-semibold text-ink-900">
                    {formatINR(v.rate_24h)}<span className="text-xs font-normal text-ink-500">/day weekday</span>
                  </p>
                  {v.weekend_rate_24h && v.weekend_rate_24h !== v.rate_24h && (
                    <p className="text-xs text-ink-500">{formatINR(v.weekend_rate_24h)}/day weekend</p>
                  )}
                </button>
              ))}
            </div>
            {errors.vehicle && <p className="field-error">{errors.vehicle}</p>}
            {quote && selectedVehicle && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
                <p className="font-semibold text-ink-900">Estimated total: {formatINR(quote.totalAmount)}</p>
                <p className="text-ink-600">
                  {quote.days} day{quote.days > 1 ? "s" : ""} ({formatINR(quote.baseAmount)}) + GST {formatINR(quote.gstAmount)}
                  {quote.offSchedulePickupFee > 0 && <> + off-schedule pickup fee {formatINR(quote.offSchedulePickupFee)}</>}
                  {quote.gatewayFeeAmount > 0 && <> + gateway fee {formatINR(quote.gatewayFeeAmount)}</>}
                  {quote.depositAmount > 0 && <> + refundable security deposit {formatINR(quote.depositAmount)}</>}.
                </p>
                {quote.belowWeekendMinimum && (
                  <p className="mt-2 font-medium text-red-700">Weekend bookings need a minimum of {quote.weekendMinDays} days for this vehicle — please add more days on the previous step.</p>
                )}
                {quote.afterHours && <p className="mt-1 font-medium text-amber-700">This is an after-hours pickup — our team will confirm any applicable surcharge.</p>}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Full name *</label>
                <input className="input" placeholder="As on your driving licence" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-invalid={!!errors.name} />
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div>
                <label className="label">Mobile number *</label>
                <input className="input" type="tel" placeholder="10-digit mobile number" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!!errors.phone} />
                <p className="mt-1 text-xs text-ink-400">We'll send your booking confirmation here on WhatsApp.</p>
                {errors.phone && <p className="field-error">{errors.phone}</p>}
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="you@example.com" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Date of birth</label>
                <input className="input" type="date" value={contact.dob} onChange={(e) => setContact({ ...contact, dob: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Address</label>
                <input className="input" placeholder="Where you're staying or your home address" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Emergency contact</label>
                <input className="input" type="tel" placeholder="A number we can call if needed" value={contact.emergencyContact} onChange={(e) => setContact({ ...contact, emergencyContact: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">Driving licence &amp; documents</h2>
            <p className="text-sm text-ink-500">Your driving licence and a government ID are required to confirm this booking — we verify them before handover.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[["licence", "Driving licence photo *"], ["govt_id", "Government ID (Aadhaar/passport) *"], ["address_proof", "Address proof"], ["photo", "Your photo"]].map(([kind, label]) => (
                <label key={kind} className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-6 text-center text-sm text-ink-500 hover:border-brand-500">
                  {documents[kind]?.url ? <span className="font-semibold text-emerald-700">✓ {label.replace(" *", "")} uploaded</span> : <span>{uploading === kind ? "Uploading…" : `Upload ${label}`}</span>}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])} />
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Licence number</label>
                <input className="input" value={documents.licence?.number ?? ""} onChange={(e) => setDocuments((d) => ({ ...d, licence: { ...d.licence, url: d.licence?.url ?? "", number: e.target.value } }))} />
              </div>
              <div>
                <label className="label">Licence expiry</label>
                <input className="input" type="date" value={documents.licence?.expiry ?? ""} onChange={(e) => setDocuments((d) => ({ ...d, licence: { ...d.licence, url: d.licence?.url ?? "", expiry: e.target.value } }))} />
              </div>
            </div>
            {errors.documents && <p className="field-error">{errors.documents}</p>}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <h2 className="font-display text-xl font-semibold text-ink-900">Review & confirm</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-ink-100 pb-2"><span className="text-ink-500">Vehicle</span><span className="font-medium text-ink-900">{selectedVehicle?.name ?? "—"} <button type="button" onClick={() => setStep(2)} className="ml-2 text-xs text-brand-700 hover:underline">Edit</button></span></div>
              <div className="flex justify-between border-b border-ink-100 pb-2"><span className="text-ink-500">Pickup</span><span className="font-medium text-ink-900">{formatDate(pickupAt)}, {formatTimeLabel(pickupTime)} {location && `· ${location}`} <button type="button" onClick={() => setStep(1)} className="ml-2 text-xs text-brand-700 hover:underline">Edit</button></span></div>
              <div className="flex justify-between border-b border-ink-100 pb-2"><span className="text-ink-500">Return (Drop)</span><span className="font-medium text-ink-900">{formatDate(returnAt)}, {formatTimeLabel(returnTime)}</span></div>
              <div className="flex justify-between border-b border-ink-100 pb-2"><span className="text-ink-500">Customer</span><span className="font-medium text-ink-900">{contact.name} · {contact.phone} <button type="button" onClick={() => setStep(3)} className="ml-2 text-xs text-brand-700 hover:underline">Edit</button></span></div>
              {quote && (
                <>
                  <div className="flex justify-between"><span className="text-ink-500">Base rental ({quote.days} day{quote.days > 1 ? "s" : ""})</span><span>{formatINR(quote.baseAmount)}</span></div>
                  {quote.offSchedulePickupFee > 0 && <div className="flex justify-between"><span className="text-ink-500">Off-schedule pickup fee</span><span>{formatINR(quote.offSchedulePickupFee)}</span></div>}
                  <div className="flex justify-between"><span className="text-ink-500">GST ({quote.gstPct}%)</span><span>{formatINR(quote.gstAmount)}</span></div>
                  {quote.gatewayFeeAmount > 0 && <div className="flex justify-between"><span className="text-ink-500">Payment gateway fee ({quote.gatewayFeePct}%)</span><span>{formatINR(quote.gatewayFeeAmount)}</span></div>}
                  <div className="flex justify-between"><span className="text-ink-500">Security deposit (refundable)</span><span>{formatINR(quote.depositAmount)}</span></div>
                  <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold text-ink-900"><span>Total payable</span><span>{formatINR(quote.totalAmount)}</span></div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4 text-sm text-ink-600">
              <p className="font-semibold text-ink-900">Terms & conditions</p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-2">
                {terms.map((t) => <li key={t} className="flex gap-2"><span aria-hidden>•</span>{t}</li>)}
              </ul>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
              I have read and accept the terms and conditions, cancellation policy and fuel policy.
            </label>
            {errors.terms && <p className="field-error">{errors.terms}</p>}

            {submitError && <p className="field-error" role="alert">{submitError}</p>}
          </div>
        )}

        <div className="mt-8 flex justify-between">
          {step > 1 ? <button type="button" onClick={back} className="btn-secondary">Back</button> : <span />}
          {step < 5 && <button type="button" onClick={next} className="btn-primary">Continue</button>}
          {step === 5 && <button type="button" onClick={submit} disabled={submitting} className="btn-primary">{submitting ? "Submitting…" : "Confirm booking"}</button>}
        </div>
      </div>
    </div>
  );
}
