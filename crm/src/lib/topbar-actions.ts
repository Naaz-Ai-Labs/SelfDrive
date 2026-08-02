"use server";

import { getDb } from "./db";
import { staffUser } from "./actions";
import { revalidatePath } from "next/cache";

export async function getNotifications() {
  const user = await staffUser();
  const db = getDb();
  const items = (
    db
      .prepare("SELECT id, title, body, read, enquiry_id, booking_id, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 12")
      .all(user.id) as Array<{ id: number; title: string; body: string | null; read: number; enquiry_id: number | null; booking_id: number | null; created_at: string }>
  ).map((r) => ({ ...r }));
  const unread = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0").get(user.id) as { c: number };
  return { items, unread: unread.c };
}

export async function markNotificationRead(id: number) {
  const user = await staffUser();
  const db = getDb();
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(id, user.id);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const user = await staffUser();
  const db = getDb();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(user.id);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export type SearchResult = { type: "booking" | "customer" | "vehicle" | "enquiry"; id: number; label: string; sub: string; href: string };

export async function globalSearch(query: string): Promise<SearchResult[]> {
  await staffUser();
  const q = query.trim();
  if (q.length < 2) return [];
  const db = getDb();
  const like = `%${q}%`;
  const results: SearchResult[] = [];

  const bookings = db
    .prepare("SELECT b.id, b.booking_no, c.name AS customer_name FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.booking_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? LIMIT 5")
    .all(like, like, like) as Array<{ id: number; booking_no: string; customer_name: string | null }>;
  for (const b of bookings) results.push({ type: "booking", id: b.id, label: b.booking_no, sub: b.customer_name ?? "Booking", href: `/dashboard/bookings/${b.id}` });

  const customers = db
    .prepare("SELECT id, name, phone FROM customers WHERE name LIKE ? OR phone LIKE ? LIMIT 5")
    .all(like, like) as Array<{ id: number; name: string; phone: string }>;
  for (const c of customers) results.push({ type: "customer", id: c.id, label: c.name, sub: c.phone, href: `/dashboard/customers` });

  const vehicles = db
    .prepare("SELECT id, name, registration_no FROM vehicles WHERE name LIKE ? OR registration_no LIKE ? LIMIT 5")
    .all(like, like) as Array<{ id: number; name: string; registration_no: string | null }>;
  for (const v of vehicles) results.push({ type: "vehicle", id: v.id, label: v.name, sub: v.registration_no ?? "Vehicle", href: `/dashboard/vehicles/${v.id}` });

  const enquiries = db
    .prepare("SELECT id, enquiry_no, name FROM enquiries WHERE enquiry_no LIKE ? OR name LIKE ? LIMIT 5")
    .all(like, like) as Array<{ id: number; enquiry_no: string; name: string | null }>;
  for (const e of enquiries) results.push({ type: "enquiry", id: e.id, label: e.enquiry_no, sub: e.name ?? "Enquiry", href: `/dashboard/enquiries/${e.id}` });

  return results.slice(0, 16);
}
