import { sbSelectOne } from "./supabase-rest";
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
export async function dispatchMessage(opts: {
  channel: string;
  to: string;
  subject?: string | null;
  body: string;
  enquiryId?: number | null;
  bookingId?: number | null;
}): Promise<DispatchResult> {
  await logMessage(opts.channel, opts.to, opts.subject ?? null, opts.body, opts.enquiryId ?? null, opts.bookingId ?? null);
  if (opts.channel === "whatsapp") {
    const phone = opts.to.replace(/\D/g, "");
    const wa = phone.startsWith("91") ? phone : `91${phone}`;
    return { ok: true, detail: `https://wa.me/${wa}?text=${encodeURIComponent(opts.body)}` };
  }
  return { ok: true, detail: "Recorded. Email/SMS gateway needs configuration." };
}

type MessageTemplate = { name: string; channel: string; body: string; subject: string | null };

export async function templateByKey(key: string): Promise<MessageTemplate | null> {
  const res = await sbSelectOne<MessageTemplate>(
    "message_templates",
    `select=name,channel,body,subject&key=eq.${encodeURIComponent(key)}&active=eq.1`
  );
  if (!res.ok) {
    console.error(`[messaging] could not load template "${key}":`, res.error);
    return null;
  }
  return res.data;
}

export async function sendTemplate(key: string, to: string, vars: Record<string, string | number | null | undefined>, enquiryId?: number | null, bookingId?: number | null): Promise<DispatchResult | null> {
  const tpl = await templateByKey(key);
  if (!tpl) return null;
  const business = await businessInfo();
  const body = renderTemplate(tpl.body, { business: (business.name as string) ?? "Darshh Holiday", ...vars });
  return dispatchMessage({ channel: tpl.channel, to, subject: tpl.subject, body, enquiryId, bookingId });
}
