import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { randomToken, parseJSON, normalizePhone } from "./utils";
import { createBooking, checkVehicleAvailable } from "./bookings";
import { calculateQuote } from "./pricing";
import { getVehicleById, getVehicles } from "./data";
import { syncEntityToSupabase } from "./supabase-sync";
import { z } from "zod";

export type DraftPayload = {
  categoryId: number | null;
  vehicleId: number | null;
  pickupAt: string | null;
  returnAt: string | null;
  location: string;
  passengers: number | null;
  step: number;
  contact: { name: string; phone: string; email?: string; address?: string; dob?: string; emergencyContact?: string };
  notes?: string;
};

export async function saveBookingDraft(input: DraftPayload & { token?: string | null }): Promise<{ token: string; savedAt: string }> {
  const db = getDb();
  const token = input.token && /^[a-f0-9]{32,64}$/.test(input.token) ? input.token : randomToken(32);
  const existing = db.prepare("SELECT id FROM enquiries WHERE draft_token = ?").get(token) as { id: number } | undefined;
  const phone = input.contact.phone ? normalizePhone(input.contact.phone) : null;
  const payload = { categoryId: input.categoryId, vehicleId: input.vehicleId, pickupAt: input.pickupAt, returnAt: input.returnAt, location: input.location, passengers: input.passengers, step: input.step, contact: input.contact, notes: input.notes };

  if (existing) {
    db.prepare(
      `UPDATE enquiries SET category_id = ?, vehicle_id = ?, pickup_date = ?, return_date = ?, location = ?, passengers = ?,
       name = ?, phone = ?, email = ?, data = ?, status = 'draft', submitted_at = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(
      input.categoryId, input.vehicleId, input.pickupAt, input.returnAt, input.location || null, input.passengers,
      input.contact.name || null, phone, input.contact.email?.trim() || null, JSON.stringify(payload), existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO enquiries (enquiry_no, category_id, vehicle_id, pickup_date, return_date, location, passengers, name, phone, email, data, status, draft_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).run(
      `DR-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
      input.categoryId, input.vehicleId, input.pickupAt, input.returnAt, input.location || null, input.passengers,
      input.contact.name || null, phone, input.contact.email?.trim() || null, JSON.stringify(payload), token
    );
  }
  return { token, savedAt: new Date().toISOString() };
}

export async function getDraft(token: string): Promise<DraftPayload | null> {
  const row = getDb().prepare("SELECT data FROM enquiries WHERE draft_token = ?").get(token) as { data: string } | undefined;
  if (!row) return null;
  return parseJSON<DraftPayload>(row.data, {
    categoryId: null, vehicleId: null, pickupAt: null, returnAt: null, location: "", passengers: null, step: 1,
    contact: { name: "", phone: "" },
  });
}

const submitSchema = z.object({
  token: z.string().optional().or(z.literal("")),
  vehicleId: z.number().int().positive(),
  pickupAt: z.string().min(10, "Select a pickup date and time."),
  returnAt: z.string().min(10, "Select a return date and time."),
  location: z.string().optional(),
  passengers: z.number().int().nonnegative().nullable().optional(),
  contact: z.object({
    name: z.string().min(2, "Please enter your full name."),
    phone: z.string().min(10, "Enter a valid mobile number."),
    email: z.string().email("Enter a valid email.").optional().or(z.literal("")),
    address: z.string().optional(),
    dob: z.string().optional(),
    emergencyContact: z.string().optional(),
  }),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "Please accept the terms and conditions to continue." }) }),
});

function normalizeDocKind(kind: string): string {
  switch (kind) {
    case "licence":
    case "driver_licence":
      return "licence";
    case "driver_govt_id":
    case "pillion_id":
    case "govt_id":
      return "govt_id";
    case "driver_photo":
    case "pillion_photo":
    case "photo":
      return "photo";
    case "address_proof":
      return "address_proof";
    default:
      return "other";
  }
}

export async function submitBooking(input: {
  token: string;
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  location?: string;
  passengers?: number | null;
  contact: DraftPayload["contact"];
  termsAccepted: boolean;
  documents?: Array<{ kind: string; url: string; number?: string; expiry?: string }>;
}): Promise<{ ok: boolean; bookingNo?: string; bookingId?: number; customerId?: number; error?: string }> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Please complete all required fields.";
    return { ok: false, error: first };
  }
  const docs = input.documents ?? [];
  const hasLicence = docs.some((d) => (d.kind === "licence" || d.kind === "driver_licence") && d.url);
  const hasGovtId = docs.some((d) => (d.kind === "govt_id" || d.kind === "driver_govt_id") && d.url);
  if (!hasLicence || !hasGovtId) {
    return { ok: false, error: "Please upload your driving licence and a government ID before confirming — this is required to hand over the vehicle." };
  }
  const db = getDb();
  const existing = parsed.data.token ? (db.prepare("SELECT id FROM enquiries WHERE draft_token = ?").get(parsed.data.token) as { id: number } | undefined) : undefined;

  try {
    const { bookingNo, bookingId, customerId } = await createBooking({
      vehicleId: parsed.data.vehicleId,
      pickupAt: parsed.data.pickupAt,
      returnAt: parsed.data.returnAt,
      location: parsed.data.location,
      passengers: parsed.data.passengers ?? undefined,
      customer: parsed.data.contact,
      enquiryId: existing?.id ?? null,
    });

    if (existing) {
      db.prepare(
        "UPDATE enquiries SET status = 'submitted', stage = 'Confirmed', submitted_at = datetime('now'), draft_token = NULL WHERE id = ?"
      ).run(existing.id);
      syncEntityToSupabase("enquiries", existing.id).catch(() => {});
    }

    // Live sync customer and booking entities to Supabase FIRST so foreign keys exist
    await syncEntityToSupabase("customers", customerId).catch(() => {});
    await syncEntityToSupabase("bookings", bookingId).catch(() => {});

    if (input.documents && input.documents.length > 0) {
      for (const d of input.documents) {
        const normalizedKind = normalizeDocKind(d.kind);
        const docRes = db.prepare("INSERT INTO customer_documents (customer_id, booking_id, kind, number, expiry_date, file_path) VALUES (?, ?, ?, ?, ?, ?)").run(
          customerId, bookingId, normalizedKind, d.number ?? null, d.expiry ?? null, d.url
        );
        const docId = Number(docRes.lastInsertRowid);
        syncEntityToSupabase("customer_documents", docId).catch(() => {});
      }
    }

    try {
      revalidatePath("/dashboard", "layout");
      revalidatePath("/dashboard/bookings", "page");
    } catch {}

    return { ok: true, bookingNo, bookingId, customerId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create booking. Please try again." };
  }
}

export async function getAvailableVehicles(kind: string | null, pickupAt: string | null, returnAt: string | null) {
  // On Vercel, SQLite is ephemeral and only has seed data. Query Supabase directly.
  if (process.env.VERCEL) {
    return getAvailableVehiclesFromSupabase(kind, pickupAt, returnAt);
  }

  // Local dev: use SQLite (it has full hydrated data)
  const vehicles = await getVehicles({ kind: kind || undefined, onlyAvailable: true });
  if (!pickupAt || !returnAt) return vehicles;

  const db = getDb();
  return vehicles
    .map((v) => {
      const clashes = db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings
           WHERE vehicle_id = ?
             AND status NOT IN ('Cancelled', 'Completed', 'Draft')
             AND NOT (return_at <= ? OR pickup_at >= ?)`
        )
        .get(v.id, pickupAt, returnAt) as { c: number } | undefined;

      const taken = clashes?.c ?? 0;
      const availableUnits = Math.max(0, (v.total_units ?? 1) - taken);
      return {
        ...v,
        available_units: availableUnits,
      };
    })
    .filter((v) => (v.available_units ?? 1) > 0);
}

async function getAvailableVehiclesFromSupabase(kind: string | null, _pickupAt: string | null, _returnAt: string | null) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // Fall back to SQLite if no Supabase credentials
    return getVehicles({ kind: kind || undefined, onlyAvailable: true });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Fetch vehicles with their category info
    let query = supabase
      .from("vehicles")
      .select("*, vehicle_categories!inner(name, kind, slug)")
      .eq("active", true)
      .eq("status", "available");

    if (kind) {
      query = query.eq("vehicle_categories.kind", kind);
    }

    const { data: vehicles, error } = await query.order("rate_24h", { ascending: true });

    if (error || !vehicles) {
      console.warn("Supabase vehicle query error:", error?.message);
      return getVehicles({ kind: kind || undefined, onlyAvailable: true });
    }

    // Fetch photos for all vehicles
    const vehicleIds = vehicles.map((v: any) => v.id);
    const { data: photos } = await supabase
      .from("vehicle_photos")
      .select("vehicle_id, url, is_primary")
      .in("vehicle_id", vehicleIds);

    const photoMap = new Map<number, { photos: string[]; primary: string }>();
    if (photos) {
      for (const p of photos) {
        const photoUrl = (p as any).url || (p as any).photo_url;
        if (!photoUrl) continue;
        const entry = photoMap.get(p.vehicle_id) || { photos: [], primary: "" };
        entry.photos.push(photoUrl);
        if (p.is_primary) entry.primary = photoUrl;
        photoMap.set(p.vehicle_id, entry);
      }
    }

    const DEFAULT_SLUG_PHOTOS: Record<string, string> = {
      "honda-dio": "/vehicles/honda-dio.avif",
      "honda-activa": "/vehicles/honda-activa.webp",
      "tvs-jupiter": "/vehicles/tvs-jupiter.webp",
      "yamaha-rayzr": "/vehicles/yamaha-rayzr.avif",
      "tvs-ntorq": "/vehicles/tvs-ntorq.webp",
      "tvs-ronin": "/vehicles/tvs-ronin.avif",
      "honda-cb200x": "/vehicles/honda-cb200x.jpg",
      "tvs-raider": "/vehicles/tvs-radar.avif",
      "bajaj-pulsar-ns": "/vehicles/bajaj-pulsar-ns.png",
      "honda-shine": "/vehicles/honda-shine.avif",
      "maruti-baleno-manual": "/vehicles/baleno-manual.avif",
      "maruti-dzire": "/vehicles/maruti-dzire.avif",
      "maruti-ciaz": "/vehicles/maruti-ciaz.jpg",
      "maruti-ertiga-7-seater": "/vehicles/maruti-ertiga.avif",
      "mahindra-thar-manual": "/vehicles/mahindra-thar.avif",
      "tempo-traveller-12": "/vehicles/tempo-traveller.jpg",
      "tempo-traveller-2days": "/vehicles/cta-tempo-banner.jpg",
    };

    return vehicles.map((v: any) => {
      const cat = v.vehicle_categories;
      const ph = photoMap.get(v.id);
      const fallback = DEFAULT_SLUG_PHOTOS[v.slug] || "/vehicles/baleno-manual.avif";
      const vehiclePhotos = ph?.photos && ph.photos.length > 0 ? ph.photos : [fallback];
      return {
        ...v,
        category_name: cat?.name || "Vehicle",
        category_kind: cat?.kind || "car",
        category_slug: cat?.slug || "cars",
        photos: vehiclePhotos,
        primary_photo: ph?.primary || vehiclePhotos[0] || fallback,
        available_units: v.available_units ?? v.total_units ?? 1,
        vehicle_categories: undefined, // remove nested join object
      };
    });
  } catch (err: any) {
    console.warn("Supabase getAvailableVehicles error:", err?.message);
    return getVehicles({ kind: kind || undefined, onlyAvailable: true });
  }
}

export async function attachCustomerDocuments(customerId: number, bookingId: number, docs: Array<{ kind: string; url: string; number?: string; expiry?: string }>) {
  const db = getDb();
  for (const d of docs) {
    const docRes = db.prepare("INSERT INTO customer_documents (customer_id, booking_id, kind, number, expiry_date, file_path) VALUES (?, ?, ?, ?, ?, ?)").run(
      customerId, bookingId, normalizeDocKind(d.kind), d.number ?? null, d.expiry ?? null, d.url
    );
    const docId = Number(docRes.lastInsertRowid);
    syncEntityToSupabase("customer_documents", docId).catch(() => {});
  }
  return { ok: true };
}


export async function getQuoteEstimate(vehicleId: number, pickupAt: string, returnAt: string) {
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return null;
  const pickup = new Date(pickupAt);
  const ret = new Date(returnAt);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(ret.getTime()) || ret.getTime() <= pickup.getTime()) return null;
  return calculateQuote(vehicle, pickup, ret);
}
