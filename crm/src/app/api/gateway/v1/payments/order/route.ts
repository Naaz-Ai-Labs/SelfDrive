import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { createBookingPaymentOrder } from "@/lib/payment-actions";
import { checkRateLimit } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;

  // Every call here writes a booking (or reprices one) and, on success, calls out to
  // Razorpay to open an order — real DB writes and real external-API quota, not a
  // cheap read. The gateway key stops a random client from hitting this directly,
  // but a retry storm or bot from the web app's own public booking flow would still
  // reach it. Keyed on the caller's IP, generous enough for a customer's own flaky
  // retries (createBooking's idempotency key already makes retries safe) while
  // capping how fast any single source can hammer this endpoint.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`booking-order:${ip}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests — please wait a moment and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const res = await createBookingPaymentOrder(
    body?.bookingId ? Number(body.bookingId) : null,
    body?.amountDue ? Number(body.amountDue) : undefined,
    body?.quote ?? null,
    body?.customer ?? null
  );
  return NextResponse.json(res);
}
