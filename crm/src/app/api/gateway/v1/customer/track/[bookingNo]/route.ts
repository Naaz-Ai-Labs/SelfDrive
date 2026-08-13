import { NextRequest, NextResponse } from "next/server";
import { sbSelect, sbSelectOne, num } from "@/lib/supabase-rest";

/**
 * Public booking tracker. Everything here comes from Supabase in one pass — the previous
 * version read a local SQLite mirror first and only fell back to Supabase for the booking
 * itself, so on a cold lambda the booking was found but its documents, payments and
 * history all came back empty and the tracker showed a paid booking as unpaid.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookingNo: string }> }) {
  const { bookingNo } = await params;
  if (!bookingNo) {
    return NextResponse.json({ ok: false, error: "Missing booking number." }, { status: 400 });
  }

  const numericId = Number(bookingNo) || 0;
  const bookingRes = await sbSelectOne<Record<string, any>>(
    "bookings",
    `select=*,customers(name,phone,email),vehicles(name,registration_no,brand,model),invoices(invoice_no,created_at)` +
      `&or=${encodeURIComponent(`(id.eq.${numericId},booking_no.eq.${bookingNo})`)}`
  );
  if (!bookingRes.ok) return NextResponse.json({ ok: false, error: bookingRes.error }, { status: 502 });

  const booking = bookingRes.data;
  if (!booking) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });

  const bookingId = Number(booking.id);
  const customerId = Number(booking.customer_id) || 0;
  const invoice = Array.isArray(booking.invoices) ? booking.invoices[0] : booking.invoices;

  const [photoRes, docsRes, paymentsRes, historyRes] = await Promise.all([
    booking.vehicle_id
      ? sbSelectOne<{ url: string }>(
          "vehicle_photos",
          `select=url&vehicle_id=eq.${Number(booking.vehicle_id)}&order=is_primary.desc`
        )
      : Promise.resolve({ ok: true as const, data: null }),
    sbSelect<Record<string, unknown>>(
      "customer_documents",
      `select=id,kind,number,verified,created_at&or=${encodeURIComponent(`(booking_id.eq.${bookingId},customer_id.eq.${customerId})`)}`
    ),
    sbSelect<Record<string, unknown>>(
      "payments",
      `select=id,payment_no,amount,kind,method,status,razorpay_payment_id,paid_at&booking_id=eq.${bookingId}&order=created_at.desc`
    ),
    sbSelect<Record<string, unknown>>(
      "booking_history",
      `select=action,detail,created_at&booking_id=eq.${bookingId}&order=created_at.asc`
    ),
  ]);

  const photoUrl = (photoRes.ok && photoRes.data?.url) || "/vehicles/mahindra-thar.avif";
  const docs = docsRes.ok ? docsRes.data : [];
  const payments = paymentsRes.ok ? paymentsRes.data : [];
  const history = historyRes.ok ? historyRes.data : [];

  // `verified` is INTEGER in the schema, not boolean.
  const totalVerifiedDocs = docs.filter((d) => num(d.verified) === 1).length;
  const isAllDocsVerified = docs.length > 0 && totalVerifiedDocs === docs.length;

  return NextResponse.json({
    ok: true,
    data: {
      id: bookingId,
      booking_no: booking.booking_no,
      status: booking.status,
      notes: booking.notes, // Contains rejection reason if rejected
      pickup_at: booking.pickup_at,
      return_at: booking.return_at,
      pickup_branch: "Darshh Holiday - Hassan & Sakleshpura Branch",
      customer_name: booking.customers?.name ?? null,
      customer_phone: booking.customers?.phone ?? null,
      vehicle_name: booking.vehicles?.name ?? null,
      registration_no: booking.vehicles?.registration_no ?? null,
      photo_url: photoUrl,
      base_amount: num(booking.base_amount),
      gst_amount: num(booking.gst_amount),
      deposit_amount: num(booking.deposit_amount),
      total_amount: num(booking.total_amount),
      paid_amount: num(booking.paid_amount),
      documents: docs.map((d) => ({
        id: Number(d.id),
        kind: String(d.kind),
        number: d.number ? String(d.number) : null,
        verified: num(d.verified) === 1,
      })),
      total_docs: docs.length,
      verified_docs: totalVerifiedDocs,
      is_all_docs_verified: isAllDocsVerified,
      payments: payments.map((p) => ({
        payment_no: String(p.payment_no),
        amount: num(p.amount),
        kind: String(p.kind),
        status: String(p.status),
        method: p.method ? String(p.method) : "Online",
        paid_at: p.paid_at ? String(p.paid_at) : null,
      })),
      history: history.map((h) => ({
        action: String(h.action),
        created_at: String(h.created_at),
      })),
      invoice_no: invoice?.invoice_no || `INV-${String(bookingId).padStart(5, "0")}`,
      created_at: booking.created_at,
    },
  });
}
