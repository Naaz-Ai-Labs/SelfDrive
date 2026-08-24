/**
 * Canonical time handling.
 *
 * STORAGE IS ALWAYS UTC. Every timestamp written to Supabase must be an ISO-8601 string
 * in UTC with a trailing `Z`. RENDERING IS ALWAYS IST — done at the display boundary by
 * formatDate/formatDateTime in ./utils, which pass `timeZone: "Asia/Kolkata"`.
 *
 * Why not store IST, given the business is entirely in India? Because the timestamp
 * columns in this schema are `text`, not `timestamptz` — Postgres normalizes nothing, so
 * whatever string is written is what comes back. Live data currently holds four
 * incompatible shapes in the same columns:
 *
 *   2026-08-24T09:32:00.000Z    ISO UTC        (payments, enquiries, booking_history)
 *   2026-08-24 15:23:18         naive, no zone (customers — every row)
 *   2026-08-24T16:00:00+05:30   IST offset     (bookings.pickup_at)
 *   0                           epoch          (renders as 01/01/1970)
 *
 * On `text`, `order=created_at.desc` is a lexicographic sort, not a chronological one, so
 * mixed shapes sort wrong against each other. One fixed shape is what makes ordering and
 * comparison correct, and ISO-UTC is the shape Vercel's lambdas, Supabase and Razorpay
 * all already speak. IST is a presentation concern.
 *
 * Use `toUtcIso` on anything arriving from outside; use `nowUtcIso` instead of
 * `new Date().toISOString()` so the intent is legible at the call site.
 */

/** Asia/Kolkata is a fixed UTC+05:30 with no DST, so a constant offset is safe. */
const IST_OFFSET_MINUTES = 330;

/** Current instant as ISO-8601 UTC. The only correct value to write to a timestamp column. */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/**
 * Razorpay reports every time as Unix epoch SECONDS in UTC (`payment.created_at`).
 * Converts to the canonical storage shape. Returns the current instant for a missing or
 * unparseable value rather than silently writing `1970-01-01`, which is how the epoch-0
 * rows already in `payments` were created.
 */
export function epochSecondsToUtcIso(seconds: unknown): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return nowUtcIso();
  return new Date(n * 1000).toISOString();
}

/**
 * Normalizes any timestamp shape found in the database (or arriving from a client) into
 * ISO-8601 UTC.
 *
 * A naive `YYYY-MM-DD HH:MM:SS` string has no zone marker, so it is ambiguous by
 * definition. `assumeNaiveIsIst` decides how to read it: the existing `customers` rows
 * were written by server code running on Vercel (UTC), so the default reads them as UTC.
 * Pass `true` only for values you know came from a human typing IST wall-clock time.
 *
 * Returns null for input that is not a timestamp at all, so callers can distinguish
 * "absent" from "epoch zero".
 */
export function toUtcIso(value: unknown, assumeNaiveIsIst = false): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Heuristic: epoch seconds are ~1.7e9 today, milliseconds ~1.7e12.
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }

  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // A bare integer string is an epoch, same as the numeric case.
  if (/^\d+$/.test(raw)) return toUtcIso(Number(raw));

  // Already carries a zone (trailing Z or ±HH:MM) — Date parses it unambiguously.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Naive: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS", no zone marker.
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, s = "0", ms = "0"] = m;
    const utcMs = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
      Number(ms.padEnd(3, "0"))
    );
    const adjusted = assumeNaiveIsIst ? utcMs - IST_OFFSET_MINUTES * 60_000 : utcMs;
    return new Date(adjusted).toISOString();
  }

  // Date-only "YYYY-MM-DD" — midnight, read in the same frame as a naive datetime.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d));
    const adjusted = assumeNaiveIsIst ? utcMs - IST_OFFSET_MINUTES * 60_000 : utcMs;
    return new Date(adjusted).toISOString();
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/** True when a stored value is already in the canonical shape. Used by the audit script. */
export function isCanonicalUtcIso(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}
