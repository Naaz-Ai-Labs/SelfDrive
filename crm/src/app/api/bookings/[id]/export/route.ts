import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getCurrentUser, assertCan } from "@/lib/auth";
import { sbSelect, sbSelectOne, num } from "@/lib/supabase-rest";
import { supabaseAdmin } from "@/lib/supabase";
import { PRIVATE_DOCS_BUCKET, isSafeStoragePath } from "@/lib/storage-buckets";
import { formatINR, formatDateTime, formatDate } from "@/lib/utils";
import { businessInfo } from "@/lib/settings";

/**
 * Full record for a single booking as a PDF: booking details, financials, payments,
 * refunds, activity, and the customer's identity documents embedded as images.
 *
 * Authorization is enforced here, server-side. The button is a convenience; a
 * caller without a session gets 401 and one without the role gets 403.
 *
 * Identity documents ARE embedded, on the owner's instruction — this document is
 * the handover pack staff carry when releasing a vehicle, so the licence and ID
 * need to be in it. They are fetched server-side out of the private bucket using
 * the service client and written straight into the PDF; no signed URL is minted and
 * no storage path is exposed. The resulting file contains personal data and is
 * marked as such in its footer.
 */

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = "—") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

/** pdfkit can rasterise JPEG and PNG only. Anything else is described, not drawn. */
const EMBEDDABLE = /\.(jpe?g|png)$/i;

type DocImage = {
  kind: string;
  number: string | null;
  verified: boolean;
  image: Buffer | null;
  note: string | null;
};

/**
 * Resolves a stored document to raw bytes.
 *
 * `file_path` holds one of two shapes: `/api/files/doc?p=<storage-key>` for anything
 * uploaded since documents moved to the private bucket, or a full URL for older
 * rows written when they still lived in public storage. Both are handled; neither
 * is ever handed to the client.
 */
async function loadDocument(filePath: string): Promise<{ bytes: Buffer | null; note: string | null }> {
  if (!filePath) return { bytes: null, note: "No file recorded." };

  try {
    if (filePath.startsWith("/api/files/doc")) {
      const key = new URL(filePath, "http://local").searchParams.get("p") ?? "";
      if (!key || !isSafeStoragePath(key)) return { bytes: null, note: "Stored path is not readable." };
      if (!EMBEDDABLE.test(key)) return { bytes: null, note: "Stored as PDF — not embeddable, view in the CRM." };
      if (!supabaseAdmin) return { bytes: null, note: "Storage is not configured." };

      const { data, error } = await supabaseAdmin.storage.from(PRIVATE_DOCS_BUCKET).download(key);
      if (error || !data) return { bytes: null, note: "File could not be read from storage." };
      return { bytes: Buffer.from(await data.arrayBuffer()), note: null };
    }

    if (/^https?:\/\//i.test(filePath)) {
      if (!EMBEDDABLE.test(filePath.split("?")[0])) {
        return { bytes: null, note: "Stored as PDF — not embeddable, view in the CRM." };
      }
      const res = await fetch(filePath, { cache: "no-store" });
      if (!res.ok) return { bytes: null, note: "File could not be retrieved." };
      return { bytes: Buffer.from(await res.arrayBuffer()), note: null };
    }

    return { bytes: null, note: "Unrecognised file reference." };
  } catch (err) {
    console.error("[export] document load failed:", err);
    return { bytes: null, note: "File could not be read." };
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    assertCan(user, "staff");
  } catch {
    return NextResponse.json({ error: "You do not have access to booking exports." }, { status: 403 });
  }

  const { id } = await params;
  const rawRef = String(id).trim();
  if (!rawRef) {
    return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  }

  // The booking is the document. If it cannot be read, fail rather than emit a
  // pack that looks complete but describes nothing.
  // Support both numeric id and booking_no (e.g. 1786539630 or BK-1786539630)
  const filter = /^\d+$/.test(rawRef)
    ? `or=(id.eq.${rawRef},booking_no.eq.${rawRef},booking_no.eq.BK-${rawRef})`
    : `or=(booking_no.eq.${encodeURIComponent(rawRef)},booking_no.eq.${encodeURIComponent(rawRef.replace(/^BK-/i, ""))})`;

  const bookingRes = await sbSelectOne<Row>(
    "bookings",
    `select=*,customers(name,phone,email,address,city),vehicles(name,registration_no,brand,model)&${filter}`
  );
  if (!bookingRes.ok) return NextResponse.json({ error: "Could not read the booking." }, { status: 502 });
  if (!bookingRes.data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const booking = bookingRes.data;
  const bookingId = Number(booking.id);
  const customerId = num(booking.customer_id);

  const [paymentsRes, refundsRes, docsRes, historyRes, inspectionsRes, business] = await Promise.all([
    sbSelect<Row>("payments", `select=*&booking_id=eq.${bookingId}&order=created_at.desc`),
    sbSelect<Row>("refunds", `select=*&booking_id=eq.${bookingId}&order=requested_at.desc`),
    // Scoped to this booking, deliberately — matching on customer_id as well is the
    // leak that stacked every past booking's documents onto whichever one was open.
    sbSelect<Row>("customer_documents", `select=*&booking_id=eq.${bookingId}&order=created_at.asc`),
    sbSelect<Row>("booking_history", `select=*&booking_id=eq.${bookingId}&order=created_at.desc`),
    sbSelect<Row>("inspections", `select=*&booking_id=eq.${bookingId}&order=created_at.asc`),
    businessInfo(),
  ]);

  const payments = paymentsRes.ok ? paymentsRes.data : [];
  const refunds = refundsRes.ok ? refundsRes.data : [];
  const documents = docsRes.ok ? docsRes.data : [];
  const history = historyRes.ok ? historyRes.data : [];
  const inspections = inspectionsRes.ok ? inspectionsRes.data : [];

  // Fetched in parallel; a single booking carries a handful of documents, so this
  // is bounded regardless of how many the customer uploaded.
  const docImages: DocImage[] = await Promise.all(
    documents.map(async (d) => {
      const { bytes, note } = await loadDocument(str(d.file_path, ""));
      return {
        kind: str(d.kind).replace(/_/g, " "),
        number: d.number ? String(d.number) : null,
        verified: num(d.verified) === 1,
        image: bytes,
        note,
      };
    })
  );

  try {
    const pdf = await buildPdf({
      businessName: str(business.name, "Darshh Holiday"),
      businessPhone: str(business.phone, ""),
      booking,
      payments,
      refunds,
      history,
      inspections,
      docImages,
      generatedBy: user.name || user.email,
      failedSections: [
        !paymentsRes.ok && "payments",
        !refundsRes.ok && "refunds",
        !docsRes.ok && "documents",
        !historyRes.ok && "history",
      ].filter(Boolean) as string[],
    });

    // Built from the booking number after stripping anything that is not
    // alphanumeric or a dash — never raw database text in a response header.
    const safeRef = str(booking.booking_no, `booking-${bookingId}`).replace(/[^A-Za-z0-9-]/g, "");
    const filename = `${safeRef || `booking-${bookingId}`}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[export] PDF generation failed for booking ${bookingId}:`, err);
    return NextResponse.json({ error: "Could not generate the document." }, { status: 500 });
  }
}

function buildPdf(input: {
  businessName: string;
  businessPhone: string;
  booking: Row;
  payments: Row[];
  refunds: Row[];
  history: Row[];
  inspections: Row[];
  docImages: DocImage[];
  generatedBy: string;
  failedSections: string[];
}): Promise<Buffer> {
  const { businessName, booking, payments, refunds, history, inspections, docImages } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 46 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const INK = "#1a1a1a";
    const MUTED = "#6b6b6b";
    const RULE = "#d9d9d9";
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const rule = () => {
      doc.moveDown(0.4);
      doc.strokeColor(RULE).lineWidth(0.8)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.6);
    };

    const heading = (text: string, needed = 140) => {
      if (doc.y > doc.page.height - needed) doc.addPage();
      doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text(text.toUpperCase());
      doc.moveDown(0.3);
    };

    const field = (label: string, value: string) => {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text(`${label}: `, { continued: true });
      doc.fillColor(INK).text(value);
    };

    const customer = booking.customers as Row | null;
    const vehicle = booking.vehicles as Row | null;
    const total = num(booking.total_amount);
    const paid = num(booking.paid_amount);
    const deposit = num(booking.deposit_amount);

    // ---- Header ----
    doc.fillColor(INK).fontSize(18).font("Helvetica-Bold").text(businessName);
    doc.fontSize(13).font("Helvetica").fillColor(MUTED).text("Booking Record");
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor(INK).font("Helvetica-Bold").text(str(booking.booking_no, `Booking #${num(booking.id)}`));
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(`Status: ${str(booking.status)}`);
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())} by ${input.generatedBy}`);
    if (input.failedSections.length) {
      doc.fillColor("#b45309").text(`Note: could not load ${input.failedSections.join(", ")}.`);
    }
    rule();

    // ---- 1. Customer ----
    heading("1. Customer");
    field("Name", str(customer?.name));
    field("Phone", str(customer?.phone));
    field("Email", str(customer?.email));
    field("Address", str(customer?.address));
    field("City", str(customer?.city));
    rule();

    // ---- 2. Rental ----
    heading("2. Rental details");
    field("Vehicle", `${str(vehicle?.name)}${vehicle?.registration_no ? ` (${vehicle.registration_no})` : ""}`);
    field("Pickup", booking.pickup_at ? formatDateTime(String(booking.pickup_at)) : "—");
    field("Return", booking.return_at ? formatDateTime(String(booking.return_at)) : "—");
    field("Actual pickup", booking.actual_pickup_at ? formatDateTime(String(booking.actual_pickup_at)) : "not recorded");
    field("Actual return", booking.actual_return_at ? formatDateTime(String(booking.actual_return_at)) : "not recorded");
    field("Included km", String(num(booking.included_km)));
    field("Odometer out / in", `${str(booking.start_odometer, "—")} / ${str(booking.end_odometer, "—")}`);
    field("Booked on", booking.created_at ? formatDateTime(String(booking.created_at)) : "—");
    rule();

    // ---- 3. Financials ----
    heading("3. Financial summary");
    field("Base rental", formatINR(num(booking.base_amount)));
    field("Other fees", formatINR(num(booking.other_fees_amount)));
    field("Extra km", formatINR(num(booking.extra_km_amount)));
    field("Late fee", formatINR(num(booking.late_fee_amount)));
    field("Damage", formatINR(num(booking.damage_amount)));
    field("GST", formatINR(num(booking.gst_amount)));
    doc.moveDown(0.2);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(INK);
    doc.text(`Total Rental: ${formatINR(total)}`);
    doc.text(`Paid: ${formatINR(paid)}`);
    doc.text(`Rental Balance: ${formatINR(Math.max(0, total - paid))}`);
    doc.font("Helvetica").fillColor(MUTED).fontSize(8);
    doc.text(`Refundable Security Deposit: ${formatINR(deposit)} (collected in cash at pickup, refundable).`);
    rule();

    // ---- 4. Payments ----
    heading(`4. Payments (${payments.length})`);
    if (!payments.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No payments recorded.");
    } else {
      for (const p of payments) {
        if (doc.y > doc.page.height - 110) doc.addPage();
        doc.fontSize(9).font("Helvetica").fillColor(INK).text(
          [
            p.paid_at ? formatDate(String(p.paid_at)) : p.created_at ? formatDate(String(p.created_at)) : "—",
            str(p.method, "Online"),
            formatINR(num(p.amount)),
            str(p.status),
            // Internal gateway reference for reconciliation. No card data.
            str(p.razorpay_payment_id ?? p.gateway_ref, "no reference"),
          ].join("   |   ")
        );
      }
    }
    rule();

    // ---- 5. Refunds ----
    if (refunds.length) {
      heading(`5. Refunds (${refunds.length})`);
      for (const r of refunds) {
        if (doc.y > doc.page.height - 110) doc.addPage();
        doc.fontSize(9).font("Helvetica").fillColor(INK).text(
          [
            r.requested_at ? formatDate(String(r.requested_at)) : "—",
            `Requested ${formatINR(num(r.requested_amount))}`,
            r.approved_amount == null ? "Not approved" : `Approved ${formatINR(num(r.approved_amount))}`,
            str(r.status),
          ].join("   |   ")
        );
      }
      rule();
    }

    // ---- 6. Inspections ----
    if (inspections.length) {
      heading(`6. Inspections (${inspections.length})`);
      for (const i of inspections) {
        doc.fontSize(9).font("Helvetica").fillColor(INK).text(
          `${str(i.kind)}   |   odometer ${str(i.odometer, "—")}   |   fuel ${str(i.fuel_level, "—")}   |   ${i.created_at ? formatDateTime(String(i.created_at)) : "—"}`
        );
      }
      rule();
    }

    // ---- 7. Identity documents (embedded) ----
    doc.addPage();
    doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text("IDENTITY DOCUMENTS");
    doc.fontSize(8).font("Helvetica").fillColor(MUTED)
      .text("Verify against the original physical documents at handover.");
    doc.moveDown(0.5);

    if (!docImages.length) {
      doc.fontSize(9).fillColor(MUTED).text("No documents uploaded for this booking.");
    } else {
      for (const d of docImages) {
        // Each document gets a clean page so the image is large enough to read a
        // licence number from — the entire point of including them.
        if (doc.y > doc.page.height - 300) doc.addPage();

        doc.fontSize(10).font("Helvetica-Bold").fillColor(INK)
          .text(d.kind.charAt(0).toUpperCase() + d.kind.slice(1));
        doc.fontSize(8).font("Helvetica").fillColor(MUTED)
          .text(`${d.verified ? "Verified" : "Pending verification"}${d.number ? `   ·   ${d.number}` : ""}`);
        doc.moveDown(0.3);

        if (d.image) {
          try {
            doc.image(d.image, { fit: [contentWidth, 300], align: "center" });
            doc.moveDown(0.5);
          } catch {
            // A corrupt or unsupported image must not abort the whole document.
            doc.fontSize(8).fillColor("#b45309").text("Image could not be rendered.");
          }
        } else {
          doc.fontSize(8).fillColor("#b45309").text(d.note ?? "File unavailable.");
        }
        doc.moveDown(0.6);
      }
    }

    // ---- 8. History ----
    if (history.length) {
      heading(`8. Activity (${history.length})`, 120);
      for (const h of history.slice(0, 40)) {
        if (doc.y > doc.page.height - 90) doc.addPage();
        doc.fontSize(8).font("Helvetica").fillColor(INK).text(
          `${h.created_at ? formatDateTime(String(h.created_at)) : "—"}   |   ${str(h.action)}   |   ${str(h.detail, "")}`
        );
      }
    }

    doc.moveDown(1);
    doc.fontSize(7).fillColor(MUTED).text(
      `${businessName} — booking record. Contains identity documents and personal data; store and share accordingly.`,
      { align: "center" }
    );

    doc.end();
  });
}
