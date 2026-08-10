export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatTimeLabel(timeStr?: string | null): string {
  if (!timeStr) return "";
  if (/am|pm/i.test(timeStr)) return timeStr;
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return timeStr;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
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

let counter = 0;
export function nextNumber(prefix: string, id: number | null | undefined): string {
  counter += 1;
  const stamp = id ?? Date.now() % 100000;
  return `${prefix}-${new Date().getFullYear()}-${String(stamp).padStart(4, "0")}-${String(counter).padStart(2, "0")}`;
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

/**
 * Calculates live-clock constraints for pickup date & time.
 * If pickupDate is TODAY, time slots that have already passed (or are less than 1 hour from now)
 * are marked invalid / disabled.
 * If all slots today are past, minPickupDate defaults to tomorrow.
 */
export function getLiveClockMinPickup(pickupDateStr?: string | null): {
  todayISO: string;
  minPickupDate: string;
  isTimeDisabled: (timeStr: string, dateStr?: string | null) => boolean;
  getValidPickupTime: (currentTimeStr: string, dateStr?: string | null) => string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayISO = `${y}-${m}-${d}`;

  // Vehicle availability starts at least 1 hour from the current live clock
  const currentHour = now.getHours();
  const minHourToday = currentHour + 1;

  let minPickupDate = todayISO;
  // If all hours for today have passed (minHourToday >= 24), minimum pickup date is tomorrow
  if (minHourToday >= 24) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ty = tomorrow.getFullYear();
    const tm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const td = String(tomorrow.getDate()).padStart(2, "0");
    minPickupDate = `${ty}-${tm}-${td}`;
  }

  const isTimeDisabled = (timeStr: string, targetDateStr?: string | null): boolean => {
    const activeDate = targetDateStr || pickupDateStr || todayISO;
    // For any FUTURE date (activeDate > todayISO), NO time slots are disabled!
    if (activeDate > todayISO) return false;
    if (activeDate < todayISO) return true;

    // For TODAY (activeDate === todayISO):
    const hour = parseInt(timeStr.split(":")[0], 10);
    return hour < minHourToday;
  };

  const getValidPickupTime = (currentTimeStr: string, targetDateStr?: string | null): string => {
    const activeDate = targetDateStr || pickupDateStr || todayISO;
    // For any FUTURE date, any selected time (or default) is 100% valid!
    if (activeDate > todayISO) return currentTimeStr || "08:00";

    if (isTimeDisabled(currentTimeStr, activeDate)) {
      const validHour = Math.min(23, minHourToday);
      return `${String(validHour).padStart(2, "0")}:00`;
    }
    return currentTimeStr || "08:00";
  };

  return { todayISO, minPickupDate, isTimeDisabled, getValidPickupTime };
}

/**
 * Calculates return date and time automatically by projecting +25 hours forward,
 * while respecting Friday & Saturday weekend package rules.
 */
export function compute25HourAutoReturn(
  pickupDateStr: string,
  pickupTimeStr: string,
  options?: { isFridayExt?: boolean; isSatSunDrop?: boolean }
): { returnDate: string; returnTime: string } {
  if (!pickupDateStr) return { returnDate: pickupDateStr, returnTime: pickupTimeStr || "08:00" };
  const parts = pickupDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return { returnDate: pickupDateStr, returnTime: pickupTimeStr || "08:00" };
  }
  const [y, m, d] = parts;
  const pDate = new Date(y, m - 1, d);
  const dayOfWeek = pDate.getDay(); // 0=Sun, 5=Fri, 6=Sat

  // Friday extension check
  if (dayOfWeek === 5 && options?.isFridayExt) {
    const mon = new Date(y, m - 1, d + 3);
    const ry = mon.getFullYear();
    const rm = String(mon.getMonth() + 1).padStart(2, "0");
    const rd = String(mon.getDate()).padStart(2, "0");
    return { returnDate: `${ry}-${rm}-${rd}`, returnTime: "08:00" };
  }

  // Saturday check
  if (dayOfWeek === 6) {
    if (options?.isSatSunDrop) {
      // Sunday drop
      const sun = new Date(y, m - 1, d + 1);
      const ry = sun.getFullYear();
      const rm = String(sun.getMonth() + 1).padStart(2, "0");
      const rd = String(sun.getDate()).padStart(2, "0");
      return { returnDate: `${ry}-${rm}-${rd}`, returnTime: "08:00" };
    } else {
      // Monday drop (default for Saturday weekend package)
      const mon = new Date(y, m - 1, d + 2);
      const ry = mon.getFullYear();
      const rm = String(mon.getMonth() + 1).padStart(2, "0");
      const rd = String(mon.getDate()).padStart(2, "0");
      return { returnDate: `${ry}-${rm}-${rd}`, returnTime: "08:00" };
    }
  }

  // Standard days (Sun, Mon, Tue, Wed, Thu, Fri without ext): +25 hours forward
  const pHour = parseInt((pickupTimeStr || "08:00").split(":")[0], 10) || 8;
  const pDateTime = new Date(y, m - 1, d, pHour, 0, 0);
  const rDateTime = new Date(pDateTime.getTime() + 25 * 60 * 60 * 1000);

  const ry = rDateTime.getFullYear();
  const rm = String(rDateTime.getMonth() + 1).padStart(2, "0");
  const rd = String(rDateTime.getDate()).padStart(2, "0");
  let rhNum = rDateTime.getHours();
  // Ensure drop-off time is never in 12 AM - 5 AM window (clamp to 06:00 AM)
  if (rhNum >= 0 && rhNum <= 5) {
    rhNum = 6;
  }
  const rh = String(rhNum).padStart(2, "0");

  return { returnDate: `${ry}-${rm}-${rd}`, returnTime: `${rh}:00` };
}
