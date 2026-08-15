import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getCurrentUser, assertCan } from "@/lib/auth";
import { sbSelect, sbSelectOne, num } from "@/lib/supabase-rest";
import { formatINR, formatDateTime, formatDate } from "@/lib/utils";
import { businessInfo } from "@/lib/settings";

/**
 * Consolidated customer record as a PDF, for staff.
 *
 * Authorization is enforced here, server-side — the UI button is a convenience, not
 * the control. An unauthenticated caller gets 401 and an under-privileged one 403,
 * regardless of what the client sends.
 *
 * Reads go through the existing sb* data access against the canonical Supabase
 * tables. There is no second customer/booking/payment query architecture: every
 * related table is fetched once, in parall, filtered by the ids already in hand, so
 * a customer with many bookings still costs a fixed number of round trips.
 *
 * Customer documents are listed by type and verification status only. The files
 * live in the private `customer-documents` bucket and are deliberately NOT embedded
 * or linked — a PDF is forwardable, and a signed URL inside one outlives the
 * session that created it. Staff view documents through the authenticated
 * /api/files/doc route instead.
 */

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = "—") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    // Staff and above. Throws FORBIDDEN for anything lower.
    assertCan(user, "staff");
  } catch {
    return NextResponse.json({ error: "You do not have access to customer exports." }, { status: 403 });
  }

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer reference." }, { status: 400 });
  }

  // Identity is critical: if this fails, the export must fail rather than produce a
  // document that looks complete but is about nobody.
  const customerRes = await sbSelectOne<Row>("customers", `select=*&id=eq.${customerId}`);
  if (!customerRes.ok) {
    return NextResponse.json({ error: "Could not read the customer record." }, { status: 502 });
  }
  if (!customerRes.data) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  const customer = customerRes.data;

  const [bookingsRes, paymentsRes, refundsRes, docsRes, business] = await Promise.all([
    sbSelect<Row>(
      "bookings",
      `select=*,vehicles(name,registration_no)&customer_id=eq.${customerId}&order=created_at.desc`
    ),
    sbSelect<Row>("payments", `select=*&customer_id=eq.${customerId}&order=created_at.desc`),
    sbSelect<Row>("refunds", `select=*&customer_id=eq.${customerId}&order=requested_at.desc`),
    sbSelect<Row>("customer_documents", `select=*&customer_id=eq.${customerId}&order=created_at.desc`),
    businessInfo(),
  ]);

  // Optional sections degrade rather than fail the whole export; a read failure is
  // reported inside the document so nobody mistakes an outage for "no records".
  const bookings = bookingsRes.ok ? bookingsRes.data : [];
  const payments = paymentsRes.ok ? paymentsRes.data : [];
  const refunds = refundsRes.ok ? refundsRes.data : [];
  const documents = docsRes.ok ? docsRes.data : [];

  const bookingIds = bookings.map((b) => Number(b.id)).filter(Number.isFinite);
  const historyRes = bookingIds.length
    ? await sbSelect<Row>(
        "booking_history",
        `select=*&booking_id=in.(${bookingIds.join(",")})&order=created_at.desc`
      )
    : { ok: true as const, data: [] as Row[] };
  const history = historyRes.ok ? historyRes.data : [];

  try {
    const pdf = await buildPdf({
      businessName: str(business.name, "Darshh Holiday"),
      customer,
      bookings,
      payments,
      refunds,
      documents,
      history,
      failedSections: [
        !bookingsRes.ok && "bookings",
        !paymentsRes.ok && "payments",
        !refundsRes.ok && "refunds",
        !docsRes.ok && "documents",
        !historyRes.ok && "history",
      ].filter(Boolean) as string[],
      generatedBy: user.name || user.email,
    });

    // Filename is built from the id and a timestamp only — never from customer-supplied
    // text, which could smuggle quotes or path separators into the header.
    const filename = `customer-record-${customerId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    // Buffer -> Uint8Array: Next's Response body type does not accept Node Buffer.
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // Never return a 200 with a broken body — a truncated PDF looks like a successful
    // download and is worse than a visible failure.
    console.error(`[export] PDF generation failed for customer ${customerId}:`, err);
    return NextResponse.json({ error: "Could not generate the document." }, { status: 500 });
  }
}

function buildPdf(input: {
  businessName: string;
  customer: Row;
  bookings: Row[];
  payments: Row[];
  refunds: Row[];
  documents: Row[];
  history: Row[];
  failedSections: string[];
  generatedBy: string;
}): Promise<Buffer> {
  const { businessName, customer, bookings, payments, refunds, documents, history } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 46 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const INK = "#1a1a1a";
    const MUTED = "#6b6b6b";
    const RULE = "#d9d9d9";

    const rule = () => {
      doc.moveDown(0.4);
      doc.strokeColor(RULE).lineWidth(0.8)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.6);
    };

    const heading = (text: string) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text(text.toUpperCase());
      doc.moveDown(0.3);
    };

    const field = (label: string, value: string) => {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text(`${label}: `, { continued: true });
      doc.fillColor(INK).text(value);
    };

    // ---- Header -----------------------------------------------------------
    doc.fillColor(INK).fontSize(18).font("Helvetica-Bold").text(businessName);
    doc.fontSize(13).font("Helvetica").fillColor(MUTED).text("Customer Record");
    doc.moveDown(0.5);
    doc.fontSize(8);
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`);
    doc.text(`Customer reference: CUS-${String(num(customer.id)).padStart(5, "0")}`);
    doc.text(`Generated by: ${input.generatedBy}`);
    if (input.failedSections.length) {
      doc.moveDown(0.3);
      doc.fillColor("#b45309").text(
        `Note: could not load ${input.failedSections.join(", ")}. Those sections may be incomplete.`
      );
    }
    rule();

    // ---- 1. Customer ------------------------------------------------------
    heading("1. Customer information");
    field("Name", str(customer.name));
    field("Customer ID", String(num(customer.id)));
    field("Phone", str(customer.phone));
    field("Email", str(customer.email));
    field("Address", str(customer.address));
    field("City", str(customer.city));
    field("Customer since", customer.created_at ? formatDate(String(customer.created_at)) : "—");
    rule();

    // ---- 2. Documents -----------------------------------------------------
    heading("2. Customer documents");
    if (!documents.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No documents on record.");
    } else {
      doc.fontSize(8).font("Helvetica").fillColor(MUTED)
        .text("Files are held in private storage and are not attached to this document. View them in the CRM.");
      doc.moveDown(0.3);
      for (const d of documents) {
        doc.fontSize(9).fillColor(INK).font("Helvetica-Bold")
          .text(str(d.kind).replace(/_/g, " "), { continued: true });
        doc.font("Helvetica").fillColor(MUTED)
          .text(`   ${num(d.verified) === 1 ? "Verified" : "Pending verification"}`
            + (d.created_at ? `   ·   uploaded ${formatDate(String(d.created_at))}` : ""));
      }
    }
    rule();

    // ---- 3. Bookings ------------------------------------------------------
    heading(`3. Bookings (${bookings.length})`);
    if (!bookings.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No bookings on record.");
    } else {
      bookings.forEach((b, i) => {
        if (doc.y > doc.page.height - 190) doc.addPage();
        const vehicle = b.vehicles as { name?: string; registration_no?: string } | null;
        const total = num(b.total_amount);
        const paid = num(b.paid_amount);

        doc.moveDown(i === 0 ? 0 : 0.5);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(INK).text(str(b.booking_no, `Booking #${num(b.id)}`));
        doc.fontSize(9).font("Helvetica");
        field("Vehicle", `${str(vehicle?.name)}${vehicle?.registration_no ? ` (${vehicle.registration_no})` : ""}`);
        field("Pickup", b.pickup_at ? formatDateTime(String(b.pickup_at)) : "—");
        field("Return", b.return_at ? formatDateTime(String(b.return_at)) : "—");
        field("Created", b.created_at ? formatDateTime(String(b.created_at)) : "—");
        field("Status", str(b.status));
        field(
          "Financials",
          `Total ${formatINR(total)}   ·   Paid ${formatINR(paid)}   ·   Outstanding ${formatINR(Math.max(0, total - paid))}`
        );
        // The deposit is collected in cash at pickup, so it is stated separately
        // rather than folded into the paid figure.
        field("Security deposit (cash at pickup)", formatINR(num(b.deposit_amount)));
      });
    }
    rule();

    // ---- 4. Payments ------------------------------------------------------
    heading(`4. Payments (${payments.length})`);
    if (!payments.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No payments on record.");
    } else {
      for (const p of payments) {
        if (doc.y > doc.page.height - 110) doc.addPage();
        doc.fontSize(9).font("Helvetica").fillColor(INK).text(
          [
            p.paid_at ? formatDate(String(p.paid_at)) : p.created_at ? formatDate(String(p.created_at)) : "—",
            str(p.method, "Online"),
            formatINR(num(p.amount)),
            str(p.status),
            // Gateway references are internal identifiers, useful for reconciliation.
            // No card data, and nothing that could authenticate as the customer.
            str(p.razorpay_payment_id ?? p.gateway_ref, "no reference"),
          ].join("   |   ")
        );
      }
      const totalPaid = payments
        .filter((p) => String(p.status) === "Paid")
        .reduce((acc, p) => acc + num(p.amount), 0);
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(`Total received: ${formatINR(totalPaid)}`);
    }
    rule();

    // ---- 5. Refunds -------------------------------------------------------
    heading(`5. Refunds (${refunds.length})`);
    if (!refunds.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No refunds on record.");
    } else {
      for (const r of refunds) {
        if (doc.y > doc.page.height - 110) doc.addPage();
        doc.fontSize(9).font("Helvetica").fillColor(INK).text(
          [
            r.requested_at ? formatDate(String(r.requested_at)) : "—",
            `Requested ${formatINR(num(r.requested_amount))}`,
            r.approved_amount === null || r.approved_amount === undefined
              ? "Not approved"
              : `Approved ${formatINR(num(r.approved_amount))}`,
            str(r.status),
            str(r.transaction_ref, "no reference"),
          ].join("   |   ")
        );
      }
    }
    rule();

    // ---- 6. History -------------------------------------------------------
    heading(`6. Booking activity (${history.length})`);
    if (!history.length) {
      doc.fontSize(9).font("Helvetica").fillColor(MUTED).text("No activity recorded.");
    } else {
      for (const h of history.slice(0, 60)) {
        if (doc.y > doc.page.height - 100) doc.addPage();
        doc.fontSize(8).font("Helvetica").fillColor(INK).text(
          `${h.created_at ? formatDateTime(String(h.created_at)) : "—"}   |   ${str(h.action)}   |   ${str(h.detail, "")}`
        );
      }
      if (history.length > 60) {
        doc.moveDown(0.3);
        doc.fillColor(MUTED).text(`… ${history.length - 60} older entries not shown.`);
      }
    }

    doc.moveDown(1);
    doc.fontSize(7).fillColor(MUTED).text(
      `Generated by the ${businessName} CRM. Contains personal data — handle according to your data-protection obligations.`,
      { align: "center" }
    );

    doc.end();
  });
}
