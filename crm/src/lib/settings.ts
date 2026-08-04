import { getDb } from "./db";
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
  ],
  task_statuses: ["Not started", "In progress", "Waiting", "Under review", "Completed", "Blocked", "Cancelled"],
  payment_statuses: ["Pending", "Partially paid", "Paid", "Overdue", "Refunded", "Failed", "Cancelled"],
  refund_statuses: ["Requested", "Under review", "Approved", "Partially approved", "Rejected", "Processing", "Completed", "Failed"],
  lead_sources: ["Website booking", "WhatsApp", "Phone call", "Walk-in", "Referral", "Instagram", "Google", "Other"],
};

export type Settings = Record<string, unknown>;

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  return parseJSON<T>(row.value, fallback);
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, JSON.stringify(value));
}

export function ensureDefaultSettings() {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS c FROM settings").get() as { c: number };
  if (count.c > 0) return;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }
}

export function businessInfo() {
  return getSetting<Record<string, unknown>>("business", DEFAULT_SETTINGS.business as Record<string, unknown>);
}

export function rentalRules() {
  return getSetting<Record<string, unknown>>("rental_rules", DEFAULT_SETTINGS.rental_rules as Record<string, unknown>);
}
