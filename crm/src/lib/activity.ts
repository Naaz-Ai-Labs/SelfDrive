/**
 * Audit trail, staff notifications and outbound-message log.
 *
 * These write straight to Supabase. The old SQLite mirror lived in os.tmpdir(), so on a
 * serverless cold start the audit trail silently started again from empty — and when the
 * native module was unavailable it degraded to a mock whose writes went nowhere at all.
 *
 * All three are now async. They are deliberately non-throwing: an audit write must never
 * take down the operation it is describing. Failures are logged instead.
 */

import { sbInsert, sbSelect } from "./supabase-rest";

export async function logActivity(
  userId: number | null,
  action: string,
  entityType?: string,
  entityId?: number | null,
  detail?: unknown
): Promise<void> {
  const res = await sbInsert("activity_logs", {
    user_id: userId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    detail: detail ? JSON.stringify(detail) : null,
    created_at: new Date().toISOString(),
  });
  if (!res.ok) console.error(`[activity] could not log "${action}":`, res.error);
}

export async function pushNotification(
  userId: number,
  title: string,
  body?: string,
  enquiryId?: number | null,
  bookingId?: number | null
): Promise<void> {
  const res = await sbInsert("notifications", {
    user_id: userId,
    enquiry_id: enquiryId ?? null,
    booking_id: bookingId ?? null,
    title,
    body: body ?? null,
    // `read` is INTEGER in the schema, not boolean.
    read: 0,
    created_at: new Date().toISOString(),
  });
  if (!res.ok) console.error(`[activity] could not notify user ${userId}:`, res.error);
}

export async function logMessage(
  channel: string,
  toAddress: string,
  subject: string | null,
  content: string,
  enquiryId?: number | null,
  bookingId?: number | null
): Promise<void> {
  const res = await sbInsert("messages", {
    enquiry_id: enquiryId ?? null,
    booking_id: bookingId ?? null,
    channel,
    to_address: toAddress,
    subject,
    content,
    created_at: new Date().toISOString(),
  });
  if (!res.ok) console.error(`[activity] could not log ${channel} message:`, res.error);
}

/**
 * Active staff ids for the given roles — the recipients of an operational notification.
 * Returns an empty list (never throws) when the lookup fails; a broken notification
 * fan-out must not fail the booking or refund that triggered it.
 */
export async function staffIdsForRoles(roles: string[]): Promise<number[]> {
  const list = roles.map((r) => `"${r}"`).join(",");
  const res = await sbSelect<{ id: number }>(
    "users",
    `select=id&role=in.(${encodeURIComponent(list)})&is_active=eq.1`
  );
  if (!res.ok) {
    console.error("[activity] could not load notification recipients:", res.error);
    return [];
  }
  return res.data.map((r) => Number(r.id));
}

/** Fans a notification out to every active staff member holding one of `roles`. */
export async function notifyRoles(
  roles: string[],
  title: string,
  body?: string,
  enquiryId?: number | null,
  bookingId?: number | null
): Promise<void> {
  const ids = await staffIdsForRoles(roles);
  await Promise.all(ids.map((id) => pushNotification(id, title, body, enquiryId, bookingId)));
}
