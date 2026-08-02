import { getDb } from "./db";
import { logMessage } from "./activity";
import { businessInfo } from "./settings";

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v === null || v === undefined ? "" : String(v));
  }
  return out;
}

export type DispatchResult = { ok: boolean; detail: string };

/**
 * Dispatches an outbound message. In this MVP build, messages are recorded in
 * the messages table and a WhatsApp deep-link is returned for manual send.
 * Production providers (WhatsApp Business API / SMS / Email) are pluggable here.
 * NEEDS CLIENT CONFIRMATION: provider credentials.
 */
export function dispatchMessage(opts: {
  channel: string;
  to: string;
  subject?: string | null;
  body: string;
  enquiryId?: number | null;
  bookingId?: number | null;
}): DispatchResult {
  const info = businessInfo();
  logMessage(opts.channel, opts.to, opts.subject ?? null, opts.body, opts.enquiryId ?? null, opts.bookingId ?? null);
  if (opts.channel === "whatsapp") {
    const phone = opts.to.replace(/\D/g, "");
    const wa = phone.startsWith("91") ? phone : `91${phone}`;
    return { ok: true, detail: `https://wa.me/${wa}?text=${encodeURIComponent(opts.body)}` };
  }
  return { ok: true, detail: "Recorded. Email/SMS gateway needs configuration." };
}

export function templateByKey(key: string): { name: string; channel: string; body: string; subject: string | null } | null {
  const row = getDb()
    .prepare("SELECT name, channel, body, subject FROM message_templates WHERE key = ? AND active = 1")
    .get(key) as { name: string; channel: string; body: string; subject: string | null } | undefined;
  return row ?? null;
}

export function sendTemplate(key: string, to: string, vars: Record<string, string | number | null | undefined>, enquiryId?: number | null, bookingId?: number | null): DispatchResult | null {
  const tpl = templateByKey(key);
  if (!tpl) return null;
  const body = renderTemplate(tpl.body, { business: (businessInfo().name as string) ?? "Darshh Holiday", ...vars });
  return dispatchMessage({ channel: tpl.channel, to, subject: tpl.subject, body, enquiryId, bookingId });
}
