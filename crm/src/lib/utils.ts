import { randomBytes } from "node:crypto";

export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

import { parseIstInstant } from "./rental-clock";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseIstInstant(value) || new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseIstInstant(value) || new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return value;
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a human-facing reference number (ENQ/PY/RC/RF/PT/INV-...).
 *
 * Every one of these columns is UNIQUE NOT NULL. The previous version combined a
 * module-level counter — reset to 0 on every serverless cold start — with
 * `Date.now() % 100000`, so two lambdas starting around the same moment could and
 * did mint the same number, and the insert failed. This has no shared state:
 * millisecond timestamp + random, both base36, give enough entropy that two
 * concurrent callers essentially never collide, with no coordination required.
 */
export function nextNumber(prefix: string, id: number | null | undefined): string {
  if (id) return `${prefix}-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  // 8 hex chars (~4.3e9 values) drawn from the CSPRNG. An earlier version used
  // Math.random() over 46,656 values, which collides ~1% of the time across a burst
  // inside a single millisecond — and every column this feeds is UNIQUE NOT NULL,
  // so a collision is a failed insert, not a cosmetic duplicate.
  const rand = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${stamp}${rand}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(days: number, from?: Date): string {
  const d = from ? new Date(from) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 2)}••••${phone.slice(-2)}`;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("+")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("91")) return `+${digits}`;
  return digits.length > 0 ? `+${digits}` : "";
}

export function waLink(phone: string, text?: string): string {
  const clean = normalizePhone(phone).replace(/\D/g, "");
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Convert Rupees float to integer minor units (Paise). e.g. ₹1500.00 -> 150000 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert integer minor units (Paise) to Rupees float. e.g. 150000 -> 1500 */
export function toRupees(paise: number): number {
  return paise / 100;
}
