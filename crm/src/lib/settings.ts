import { sbSelect, sbUpsert } from "./supabase-rest";
import { parseJSON } from "./utils";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  business: {
    name: "Darshh Holiday",
    tagline: "Ride More. Explore More.",
    phone: "+91 76768 75595",
    whatsapp: "+91 76768 75595",
    email: "hello@darshhrentals.in",
    address: "Sakleshpura & Hassan, Hassan District, Karnataka",
    city: "Hassan",
    hours: "Pre-booking only · Mon–Sun, 8:00 AM – 8:00 AM",
    social: {
      instagram: "https://www.instagram.com/hassan_sakleshpura_bike_rental",
      facebook: "",
      youtube: "",
    },
  },
  currency: "INR",
  tax_pct: 5,
  fuel_policy: "Vehicles are rented without fuel — return with the same fuel level you received it at.",
  no_bargain_policy: true,
  rental_rules: {
    standard_period_hours: 12,
    standard_pickup_time: "08:00",
    standard_return_time: "20:00",
    operating_hours: "08:00 AM - 08:00 AM",
    early_pickup_cutoff: "07:59",
    early_pickup_fee: 250,
    late_drop_cutoff: "20:00",
    late_drop_fee: 250,
    off_schedule_pickup_fee: 250,
    weekend_min_days: 2,
    grace_period_minutes: 15,
    late_fee_tier1: 250,
    late_fee_tier1_max_minutes: 30,
    late_fee_per_hour: 150,
    late_fee_full_day_after_hours: 6,
    advance_pct: 100,
    min_hours_advance: 2,
    default_extra_km_rate: 8,
    default_included_km: 100,
    gateway_fee_pass_through: false,
    gateway_fee_pct: 2,
    cancel_full_refund_hours: 24,
    cancel_partial_refund_hours: 6,
    cancel_partial_refund_pct: 50,
    cancel_processing_fee_pct: 5,
  },
  enquiry_stages: ["New", "Contacted", "Documents pending", "Payment pending", "Confirmed", "Follow-up", "Lost", "Cancelled"],
  booking_statuses: [
    "Draft",
    "Pending verification",
    "Pending payment",
    "Payment received",
    "Confirmed",
    "Ready for pickup",
    "Vehicle handed over",
    "Active rental",
    "Return pending",
    "Vehicle returned",
    "Inspection pending",
    "Additional charges pending",
    "Refund pending",
    "Completed",
    "Cancelled",
    "Rejected",
  ],
  task_statuses: ["Not started", "In progress", "Waiting", "Under review", "Completed", "Blocked", "Cancelled"],
  payment_statuses: ["Pending", "Partially paid", "Paid", "Overdue", "Refunded", "Failed", "Cancelled"],
  refund_statuses: ["Requested", "Under review", "Approved", "Partially approved", "Rejected", "Processing", "Completed", "Failed"],
  lead_sources: ["Website booking", "WhatsApp", "Phone call", "Walk-in", "Referral", "Instagram", "Google", "Other"],
};

export type Settings = Record<string, unknown>;

type SettingRow = { key: string; value: string };

/**
 * Reads every setting in one round trip.
 *
 * A page that needs six settings used to issue six queries; against PostgREST that
 * would be six HTTP requests. The table holds a couple of dozen rows, so fetching it
 * whole is cheaper than any of the alternatives.
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const res = await sbSelect<SettingRow>("settings", "select=key,value");
  if (!res.ok) throw new Error(`Could not load settings: ${res.error}`);

  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of res.data) {
    out[row.key] = parseJSON<unknown>(row.value, DEFAULT_SETTINGS[row.key]);
  }
  return out;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const res = await sbSelect<SettingRow>("settings", `select=value&key=eq.${encodeURIComponent(key)}&limit=1`);
  // A read failure is not "no such setting". Surfacing it stops a pricing rule or a
  // status list from silently reverting to a hardcoded default mid-transaction.
  if (!res.ok) throw new Error(`Could not load setting "${key}": ${res.error}`);

  const row = res.data[0];
  if (!row) return fallback;
  return parseJSON<T>(row.value, fallback);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const res = await sbUpsert("settings", { key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, "key");
  if (!res.ok) throw new Error(`Could not save setting "${key}": ${res.error}`);
}

export async function ensureDefaultSettings(): Promise<void> {
  const res = await sbSelect<{ key: string }>("settings", "select=key");
  if (!res.ok) throw new Error(`Could not read settings: ${res.error}`);

  const present = new Set(res.data.map((r) => r.key));
  const missing = Object.entries(DEFAULT_SETTINGS)
    .filter(([key]) => !present.has(key))
    .map(([key, value]) => ({ key, value: JSON.stringify(value) }));

  if (missing.length === 0) return;
  const write = await sbUpsert("settings", missing, "key");
  if (!write.ok) throw new Error(`Could not seed default settings: ${write.error}`);
}

export async function businessInfo(): Promise<Record<string, unknown>> {
  return getSetting<Record<string, unknown>>("business", DEFAULT_SETTINGS.business as Record<string, unknown>);
}

export async function rentalRules(): Promise<Record<string, unknown>> {
  return getSetting<Record<string, unknown>>("rental_rules", DEFAULT_SETTINGS.rental_rules as Record<string, unknown>);
}
