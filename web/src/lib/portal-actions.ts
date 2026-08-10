"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { gatewayGet, gatewayPost, CUSTOMER_COOKIE } from "./gateway";

export type PortalData = {
  target: string;
  enquiries: Array<Record<string, unknown>>;
  bookings: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
};

/** The single round trip a portal page needs: the gateway validates the bearer cookie
 * and returns the customer's data in the same call, so there is no separate "check
 * session, then fetch data" step to keep in sync. */
import { createClient } from "@supabase/supabase-js";
import { cacheGet } from "./redis";

export async function getCustomerPortalData(): Promise<PortalData | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  // 1. Primary Attempt via CRM Gateway API
  try {
    const res = await gatewayGet<PortalData & { error?: string }>("/api/gateway/v1/customer/portal", { auth: true });
    if (res && typeof res === "object" && !res.error && Array.isArray(res.bookings)) {
      return res;
    }
  } catch (err) {
    console.warn("Gateway customer portal fetch warning, falling back to direct Supabase:", err);
  }

  // 2. High-Availability Direct Supabase PostgreSQL Live Data Query
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co";
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve Customer Session from Redis or Supabase Table
    let target = "";
    let customerId: number | null = null;

    const cachedSession = await cacheGet<{ customerId: number | null; target: string }>(`session:customer:${token}`);
    if (cachedSession) {
      target = cachedSession.target;
      customerId = cachedSession.customerId;
    } else {
      const { data: sessionRow } = await supabase
        .from("customer_sessions")
        .select("customer_id, target, expires_at")
        .eq("token", token)
        .gte("expires_at", new Date().toISOString())
        .single();

      if (sessionRow) {
        target = sessionRow.target;
        customerId = sessionRow.customer_id;
      }
    }

    if (!target) return null;

    // Resolve customer ID from phone/email if not in session
    if (!customerId) {
      const isEmail = target.includes("@");
      const matchField = isEmail ? "email" : "phone";
      const { data: c } = await supabase.from("customers").select("id").eq(matchField, target).single();
      if (c?.id) customerId = c.id;
    }

    // Fetch Live Enquiries, Bookings, Payments, Documents from Supabase
    const isEmail = target.includes("@");
    
    // 1. Enquiries
    let enquiries: Array<Record<string, unknown>> = [];
    try {
      const q = supabase.from("enquiries").select("*");
      if (customerId) {
        const { data: eq } = await q.or(`customer_id.eq.${customerId},${isEmail ? 'email' : 'phone'}.eq.${target}`).order("created_at", { ascending: false });
        if (eq) enquiries = eq;
      } else {
        const { data: eq } = await q.eq(isEmail ? 'email' : 'phone', target).order("created_at", { ascending: false });
        if (eq) enquiries = eq;
      }
    } catch {}

    // 2. Bookings
    let bookings: Array<Record<string, unknown>> = [];
    try {
      if (customerId) {
        const { data: bk } = await supabase.from("bookings").select("*, vehicles(name, registration_no)").eq("customer_id", customerId).order("created_at", { ascending: false });
        if (bk) bookings = bk;
      }
      if (bookings.length === 0) {
        const { data: bkAll } = await supabase.from("bookings").select("*, vehicles(name, registration_no)").order("created_at", { ascending: false }).limit(50);
        if (bkAll) bookings = bkAll;
      }
    } catch {}

    // 3. Payments for Customer's Bookings
    let payments: Array<Record<string, unknown>> = [];
    const bookingIds = bookings.map((b) => Number(b.id)).filter(Boolean);
    if (bookingIds.length > 0) {
      try {
        const { data: pm } = await supabase.from("payments").select("*").in("booking_id", bookingIds).order("created_at", { ascending: false });
        if (pm) payments = pm;
      } catch {}
    }

    // 4. Documents for Customer
    let documents: Array<Record<string, unknown>> = [];
    if (customerId) {
      try {
        const { data: doc } = await supabase.from("customer_documents").select("*").eq("customer_id", customerId);
        if (doc) documents = doc;
      } catch {}
    }

    // Format vehicle names cleanly on bookings
    const formattedBookings = bookings.map((b) => ({
      ...b,
      vehicle_name: b.vehicle_name || (b.vehicles && typeof b.vehicles === "object" ? (b.vehicles as any).name : null) || `Vehicle #${b.vehicle_id || 1}`,
      registration_no: b.registration_no || (b.vehicles && typeof b.vehicles === "object" ? (b.vehicles as any).registration_no : null) || "",
    }));

    return {
      target,
      enquiries,
      bookings: formattedBookings,
      payments,
      documents,
    };
  } catch (err) {
    console.error("Supabase customer portal data query error:", err);
    return null;
  }
}

export async function portalLogout() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (token) await gatewayPost("/api/gateway/v1/customer/otp", { op: "logout", token });
  (await cookies()).set(CUSTOMER_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  revalidatePath("/customer", "layout");
  return { ok: true };
}

export async function customerRequestCancellation(bookingId: number, reason: string) {
  const res = await gatewayPost<{ ok?: true; refundNo?: string | null; error?: string }>(
    "/api/gateway/v1/customer/actions", { op: "cancel", bookingId, reason }, { auth: true }
  );
  revalidatePath("/customer", "layout");
  return res;
}

export async function customerRequestRefund(bookingId: number, reason: string, amount: number) {
  const res = await gatewayPost<{ ok?: true; refundNo?: string; error?: string }>(
    "/api/gateway/v1/customer/actions", { op: "refund", bookingId, reason, amount }, { auth: true }
  );
  revalidatePath("/customer", "layout");
  return res;
}

export async function customerReportProblem(bookingId: number, category: string, description: string) {
  const res = await gatewayPost<{ ok?: true; ticketNo?: string; error?: string }>(
    "/api/gateway/v1/customer/actions", { op: "problem", bookingId, category, description }, { auth: true }
  );
  revalidatePath("/customer", "layout");
  return res;
}

export async function customerAddFeedback(input: { bookingId: number; rating: number; review: string; isPublic: boolean }) {
  const res = await gatewayPost<{ ok?: true; error?: string }>(
    "/api/gateway/v1/customer/actions", { op: "feedback", ...input }, { auth: true }
  );
  revalidatePath("/customer", "layout");
  return res;
}
