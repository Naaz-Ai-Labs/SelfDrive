import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { sbSelect } from "@/lib/supabase-rest";

/** Builds a PostgREST `in.(…)` predicate for numeric ids. */
function inList(ids: number[]): string {
  return `in.(${ids.join(",")})`;
}

export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const phone = customer.target;
  const email = customer.target.toLowerCase().trim();

  // The category name came from a LEFT JOIN; PostgREST expresses it as an embed and it is
  // flattened below so the response shape the web app consumes does not change.
  const [enquiriesRes, bookingsRes] = await Promise.all([
    sbSelect<Record<string, unknown>>(
      "enquiries",
      `select=*,vehicle_categories(name)&or=${encodeURIComponent(`(phone.eq.${phone},email.eq.${email})`)}&order=created_at.desc&limit=10`
    ),
    customer.customerId
      ? sbSelect<Record<string, unknown>>(
          "bookings",
          `select=*,vehicles(name)&customer_id=eq.${customer.customerId}&order=created_at.desc`
        )
      : Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] }),
  ]);

  if (!enquiriesRes.ok) return NextResponse.json({ error: enquiriesRes.error }, { status: 502 });
  if (!bookingsRes.ok) return NextResponse.json({ error: bookingsRes.error }, { status: 502 });

  const enquiries = enquiriesRes.data.map((e) => {
    const { vehicle_categories, ...rest } = e as { vehicle_categories?: { name: string } | null };
    return { ...rest, category_name: vehicle_categories?.name ?? null };
  });

  const bookings = bookingsRes.data.map((b) => {
    const { vehicles, ...rest } = b as { vehicles?: { name: string } | null };
    return { ...rest, vehicle_name: vehicles?.name ?? null };
  });

  const bookingIds = bookingsRes.data.map((b) => Number(b.id)).filter((n) => Number.isFinite(n));

  const [paymentsRes, documentsRes] = await Promise.all([
    bookingIds.length
      ? sbSelect<Record<string, unknown>>("payments", `select=*&booking_id=${inList(bookingIds)}&order=due_date`)
      : Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] }),
    bookingIds.length
      ? sbSelect<Record<string, unknown>>("customer_documents", `select=*&booking_id=${inList(bookingIds)}`)
      : Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] }),
  ]);

  if (!paymentsRes.ok) return NextResponse.json({ error: paymentsRes.error }, { status: 502 });
  if (!documentsRes.ok) return NextResponse.json({ error: documentsRes.error }, { status: 502 });

  return NextResponse.json({
    target: customer.target,
    enquiries,
    bookings,
    payments: paymentsRes.data,
    documents: documentsRes.data,
  });
}
