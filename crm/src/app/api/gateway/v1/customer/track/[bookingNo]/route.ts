import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingNo: string }> }
) {
  const { bookingNo } = await params;
  if (!bookingNo) {
    return NextResponse.json({ ok: false, error: "Missing booking number." }, { status: 400 });
  }

  const db = getDb();
  let booking: any = db
    .prepare(
      `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              v.name AS vehicle_name, v.registration_no, v.brand, v.model,
              i.invoice_no, i.created_at AS invoice_created_at
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.booking_no = ? OR b.id = ?`
    )
    .get(bookingNo, Number(bookingNo) || 0);

  // Fallback to Supabase if not found in local DB
  if (!booking) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const sb = createClient(supabaseUrl, supabaseKey);
        let q = sb.from("bookings").select("*, vehicles(*), customers(*)");
        if (/^\d+$/.test(bookingNo)) {
          q = q.eq("id", Number(bookingNo));
        } else {
          q = q.eq("booking_no", bookingNo);
        }
        const { data: b } = await q.single();
        if (b) {
          booking = {
            ...b,
            customer_name: b.customers?.name,
            customer_phone: b.customers?.phone,
            customer_email: b.customers?.email,
            vehicle_name: b.vehicles?.name,
            registration_no: b.vehicles?.registration_no,
          };
        }
      } catch {}
    }
  }

  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  }

  // Get photo
  let photoUrl = "/vehicles/mahindra-thar.avif";
  if (booking.vehicle_id) {
    const photoRow = db.prepare("SELECT url FROM vehicle_photos WHERE vehicle_id = ? ORDER BY is_primary DESC LIMIT 1").get(booking.vehicle_id) as { url: string } | undefined;
    if (photoRow?.url) photoUrl = photoRow.url;
  }

  // Get documents
  const docs = db
    .prepare("SELECT id, kind, number, verified, created_at FROM customer_documents WHERE booking_id = ? OR customer_id = ?")
    .all(booking.id, booking.customer_id || 0) as Array<Record<string, unknown>>;

  // Get payments
  const payments = db
    .prepare("SELECT id, payment_no, amount, kind, method, status, razorpay_payment_id, paid_at FROM payments WHERE booking_id = ? ORDER BY created_at DESC")
    .all(booking.id) as Array<Record<string, unknown>>;

  // Get history logs
  const history = db
    .prepare("SELECT action, detail, created_at FROM booking_history WHERE booking_id = ? ORDER BY created_at ASC")
    .all(booking.id) as Array<Record<string, unknown>>;

  const totalVerifiedDocs = docs.filter((d) => Number(d.verified) === 1).length;
  const isAllDocsVerified = docs.length > 0 && totalVerifiedDocs === docs.length;

  return NextResponse.json({
    ok: true,
    data: {
      id: booking.id,
      booking_no: booking.booking_no,
      status: booking.status,
      notes: booking.notes, // Contains rejection reason if rejected
      pickup_at: booking.pickup_at,
      return_at: booking.return_at,
      pickup_branch: "Darshh Holiday - Hassan & Sakleshpura Branch",
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone,
      vehicle_name: booking.vehicle_name,
      registration_no: booking.registration_no,
      photo_url: photoUrl,
      base_amount: Number(booking.base_amount || 0),
      gst_amount: Number(booking.gst_amount || 0),
      deposit_amount: Number(booking.deposit_amount || 0),
      total_amount: Number(booking.total_amount || 0),
      paid_amount: Number(booking.paid_amount || 0),
      documents: docs.map((d) => ({
        id: Number(d.id),
        kind: String(d.kind),
        number: d.number ? String(d.number) : null,
        verified: Number(d.verified) === 1,
      })),
      total_docs: docs.length,
      verified_docs: totalVerifiedDocs,
      is_all_docs_verified: isAllDocsVerified,
      payments: payments.map((p) => ({
        payment_no: String(p.payment_no),
        amount: Number(p.amount),
        kind: String(p.kind),
        status: String(p.status),
        method: p.method ? String(p.method) : "Online",
        paid_at: p.paid_at ? String(p.paid_at) : null,
      })),
      history: history.map((h) => ({
        action: String(h.action),
        created_at: String(h.created_at),
      })),
      invoice_no: booking.invoice_no || `INV-${String(booking.id).padStart(5, "0")}`,
      created_at: booking.created_at,
    },
  });
}
