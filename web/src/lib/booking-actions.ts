"use server";

import { revalidatePath } from "next/cache";
import { gatewayGet, gatewayPost } from "./gateway";
import type { Vehicle } from "./data";

export type DraftPayload = {
  categoryId: number | null;
  vehicleId: number | null;
  pickupAt: string | null;
  returnAt: string | null;
  location: string;
  passengers: number | null;
  step: number;
  contact: { name: string; phone: string; email?: string; address?: string; dob?: string; emergencyContact?: string };
  notes?: string;
};

export type Quote = {
  days: number;
  dayBreakdown: Array<{ date: string; isWeekend: boolean; rate: number }>;
  baseAmount: number;
  offSchedulePickupFee: number;
  gstAmount: number;
  gstPct: number;
  gatewayFeeAmount: number;
  gatewayFeePct: number;
  depositAmount: number;
  includedKm: number;
  extraKmRate: number;
  afterHours: boolean;
  offSchedulePickup: boolean;
  weekendMinDays: number;
  belowWeekendMinimum: boolean;
  appliedRuleName: string | null;
  totalAmount: number;
  payableNow: number;
};

export async function saveBookingDraft(input: DraftPayload & { token?: string | null }): Promise<{ token: string; savedAt: string }> {
  return gatewayPost("/api/gateway/v1/booking/draft", input);
}

export async function getDraft(token: string): Promise<DraftPayload | null> {
  const res = await gatewayGet<{ draft: DraftPayload | null }>(`/api/gateway/v1/booking/draft?token=${encodeURIComponent(token)}`);
  return res?.draft ?? null;
}

export async function submitBooking(input: {
  token: string;
  vehicleId: number;
  pickupAt: string;
  returnAt: string;
  location?: string;
  passengers?: number | null;
  contact: DraftPayload["contact"];
  termsAccepted: boolean;
  documents?: Array<{ kind: string; url: string; number?: string; expiry?: string }>;
}): Promise<{ ok: boolean; bookingNo?: string; bookingId?: number; customerId?: number; error?: string }> {
  const res = await gatewayPost<{ ok: boolean; bookingNo?: string; bookingId?: number; customerId?: number; error?: string }>("/api/gateway/v1/booking/submit", input);
  try {
    revalidatePath("/", "layout");
    revalidatePath("/vehicles", "page");
    revalidatePath("/booking", "page");
  } catch {}
  return res;
}

export async function getAvailableVehicles(kind: string | null, pickupAt: string | null, returnAt: string | null): Promise<Vehicle[]> {
  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);
  if (pickupAt) qs.set("pickupAt", pickupAt);
  if (returnAt) qs.set("returnAt", returnAt);
  const res = await gatewayGet<{ vehicles: Vehicle[] }>(`/api/gateway/v1/booking/available?${qs.toString()}`);
  if (res && Array.isArray(res.vehicles) && res.vehicles.length > 0) {
    return res.vehicles;
  }
  // Fallback to static/cached fleet data if gateway fails or returns empty
  const { getVehicles } = await import("@/lib/data");
  const all = await getVehicles();
  return kind ? all.filter((v) => v.category_kind === kind) : all;
}

export async function getQuoteEstimate(vehicleId: number, pickupAt: string, returnAt: string): Promise<Quote | null> {
  const res = await gatewayPost<{ quote: Quote | null }>("/api/gateway/v1/booking/quote", { vehicleId, pickupAt, returnAt });
  return res?.quote ?? null;
}

export async function getVehicleById(id: number): Promise<Vehicle | null> {
  const res = await gatewayGet<{ vehicle: Vehicle | null }>(`/api/gateway/v1/booking/vehicle?id=${id}`);
  if (res && res.vehicle) return res.vehicle;
  const { getVehicles } = await import("@/lib/data");
  const all = await getVehicles();
  return all.find((v) => Number(v.id) === Number(id)) ?? null;
}
