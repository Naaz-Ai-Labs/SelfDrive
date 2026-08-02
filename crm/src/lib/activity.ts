import { getDb } from "./db";

export function logActivity(
  userId: number | null,
  action: string,
  entityType?: string,
  entityId?: number | null,
  detail?: unknown
) {
  try {
    getDb()
      .prepare(
        "INSERT INTO activity_logs (user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)"
      )
      .run(userId, action, entityType ?? null, entityId ?? null, detail ? JSON.stringify(detail) : null);
  } catch {
    // Activity logging must never break the primary operation.
  }
}

export function pushNotification(
  userId: number,
  title: string,
  body?: string,
  enquiryId?: number | null,
  bookingId?: number | null
) {
  try {
    getDb()
      .prepare(
        "INSERT INTO notifications (user_id, enquiry_id, booking_id, title, body) VALUES (?, ?, ?, ?, ?)"
      )
      .run(userId, enquiryId ?? null, bookingId ?? null, title, body ?? null);
  } catch {
    // noop
  }
}

export function logMessage(
  channel: string,
  toAddress: string,
  subject: string | null,
  content: string,
  enquiryId?: number | null,
  bookingId?: number | null
) {
  getDb()
    .prepare(
      "INSERT INTO messages (enquiry_id, booking_id, channel, to_address, subject, content) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(enquiryId ?? null, bookingId ?? null, channel, toAddress, subject, content);
}
