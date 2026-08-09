import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { randomToken, parseJSON, normalizePhone } from "./utils";
import { createBooking, checkVehicleAvailable } from "./bookings";
import { calculateQuote } from "./pricing";
import { getVehicleById, getVehicles } from "./data";
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
    const { bookingNo, bookingId, customerId } = createBooking({
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
    }

    if (input.documents && input.documents.length > 0) {
      for (const d of input.documents) {
        db.prepare("INSERT INTO customer_documents (customer_id, booking_id, kind, number, expiry_date, file_path) VALUES (?, ?, ?, ?, ?, ?)").run(
          customerId, bookingId, normalizeDocKind(d.kind), d.number ?? null, d.expiry ?? null, d.url
        );
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
  const vehicles = getVehicles({ kind: kind || undefined, onlyAvailable: true });
  if (!pickupAt || !returnAt) return vehicles;
  return vehicles.filter((v) => checkVehicleAvailable(v.id, pickupAt, returnAt));
}

export async function attachCustomerDocuments(customerId: number, bookingId: number, docs: Array<{ kind: string; url: string; number?: string; expiry?: string }>) {
  const db = getDb();
  for (const d of docs) {
    db.prepare("INSERT INTO customer_documents (customer_id, booking_id, kind, number, expiry_date, file_path) VALUES (?, ?, ?, ?, ?, ?)").run(
      customerId, bookingId, normalizeDocKind(d.kind), d.number ?? null, d.expiry ?? null, d.url
    );
  }
  return { ok: true };
}


export async function getQuoteEstimate(vehicleId: number, pickupAt: string, returnAt: string) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return null;
  const pickup = new Date(pickupAt);
  const ret = new Date(returnAt);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(ret.getTime()) || ret.getTime() <= pickup.getTime()) return null;
  return calculateQuote(vehicle, pickup, ret);
}
