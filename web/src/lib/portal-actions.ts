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
export async function getCustomerPortalData(): Promise<PortalData | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const res = await gatewayGet<PortalData & { error?: string }>("/api/gateway/v1/customer/portal", { auth: true });
  if (!res || "error" in res) return null;
  return res;
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
