"use server";

/**
 * Top bar: the staff notification tray and the global search box.
 *
 * Both read Supabase directly. The search used to be four SQL statements against the
 * local mirror; PostgREST cannot join across unrelated tables in one request, so the four
 * lookups are issued in parallel and merged here. That is four HTTP calls, not four
 * sequential round trips.
 */

import { sbSelect, sbUpdate, sbCount } from "./supabase-rest";
import { staffUser } from "./actions";
import { revalidatePath } from "next/cache";

export type NotificationItem = {
  id: number;
  title: string;
  body: string | null;
  read: number;
  enquiry_id: number | null;
  booking_id: number | null;
  created_at: string;
};

export async function getNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  try {
    const user = await staffUser();

    const [listRes, unreadRes] = await Promise.all([
      sbSelect<NotificationItem>(
        "notifications",
        `select=id,title,body,read,enquiry_id,booking_id,created_at&user_id=eq.${user.id}&order=created_at.desc&limit=12`
      ),
      sbCount("notifications", `user_id=eq.${user.id}&read=eq.0`),
    ]);

    if (!listRes.ok) {
      console.error("[topbar] could not load notifications:", listRes.error);
      return { items: [], unread: 0 };
    }

    return {
      items: listRes.data.map((r) => ({ ...r, read: Number(r.read) })),
      unread: unreadRes.ok ? unreadRes.data : 0,
    };
  } catch {
    // Not signed in, or the session lookup failed — show an empty tray rather than a crash.
    return { items: [], unread: 0 };
  }
}

export async function markNotificationRead(id: number) {
  const user = await staffUser();
  // `read` is INTEGER in the schema, not boolean.
  const res = await sbUpdate("notifications", `id=eq.${id}&user_id=eq.${user.id}`, { read: 1 });
  if (!res.ok) return { error: `Could not update the notification: ${res.error}` };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const user = await staffUser();
  const res = await sbUpdate("notifications", `user_id=eq.${user.id}&read=eq.0`, { read: 1 });
  if (!res.ok) return { error: `Could not update the notifications: ${res.error}` };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export type SearchResult = { type: "booking" | "customer" | "vehicle" | "enquiry"; id: number; label: string; sub: string; href: string };

/** Builds an encoded PostgREST `or=(col.ilike.*term*,…)` filter. */
function orIlike(term: string, columns: string[]): string {
  const escaped = term.replace(/[(),"\\]/g, " ").trim();
  return `or=${encodeURIComponent(`(${columns.map((c) => `${c}.ilike.*${escaped}*`).join(",")})`)}`;
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  await staffUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const [bookings, customers, vehicles, enquiries] = await Promise.all([
    // The customer name/phone half of the old LIKE is expressed as an embedded filter on
    // the joined customers row; PostgREST cannot OR across a base table and an embed, so
    // the booking number and the customer are two passes merged below.
    Promise.all([
      sbSelect<{ id: number; booking_no: string; customers: { name: string | null } | null }>(
        "bookings",
        `select=id,booking_no,customers(name)&${orIlike(q, ["booking_no"])}&limit=5`
      ),
      sbSelect<{ id: number; booking_no: string; customers: { name: string | null } | null }>(
        "bookings",
        `select=id,booking_no,customers!inner(name,phone)&${orIlike(q, ["customers.name", "customers.phone"])}&limit=5`
      ),
    ]),
    sbSelect<{ id: number; name: string; phone: string | null }>(
      "customers",
      `select=id,name,phone&${orIlike(q, ["name", "phone"])}&limit=5`
    ),
    sbSelect<{ id: number; name: string; registration_no: string | null }>(
      "vehicles",
      `select=id,name,registration_no&${orIlike(q, ["name", "registration_no"])}&limit=5`
    ),
    sbSelect<{ id: number; enquiry_no: string; name: string | null }>(
      "enquiries",
      `select=id,enquiry_no,name&${orIlike(q, ["enquiry_no", "name"])}&limit=5`
    ),
  ]);

  const results: SearchResult[] = [];
  const seenBookings = new Set<number>();

  for (const res of bookings) {
    if (!res.ok) {
      console.error("[search] bookings:", res.error);
      continue;
    }
    for (const b of res.data) {
      const id = Number(b.id);
      if (seenBookings.has(id)) continue;
      seenBookings.add(id);
      results.push({ type: "booking", id, label: b.booking_no, sub: b.customers?.name ?? "Booking", href: `/dashboard/bookings/${id}` });
    }
  }

  if (customers.ok) {
    for (const c of customers.data) {
      results.push({ type: "customer", id: Number(c.id), label: c.name, sub: c.phone ?? "Customer", href: `/dashboard/customers` });
    }
  } else console.error("[search] customers:", customers.error);

  if (vehicles.ok) {
    for (const v of vehicles.data) {
      results.push({ type: "vehicle", id: Number(v.id), label: v.name, sub: v.registration_no ?? "Vehicle", href: `/dashboard/vehicles/${v.id}` });
    }
  } else console.error("[search] vehicles:", vehicles.error);

  if (enquiries.ok) {
    for (const e of enquiries.data) {
      results.push({ type: "enquiry", id: Number(e.id), label: e.enquiry_no, sub: e.name ?? "Enquiry", href: `/dashboard/enquiries/${e.id}` });
    }
  } else console.error("[search] enquiries:", enquiries.error);

  return results.slice(0, 16);
}
