import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { sbSelect, sbSelectOne, sbUpdate, num } from "./supabase-rest";
import { supabaseAdmin } from "./supabase";
import { PRIVATE_DOCS_BUCKET, PUBLIC_MEDIA_BUCKET, isSafeStoragePath } from "./storage-buckets";
import { getWritableUploadsDir } from "./uploads-dir";
import { formatINR, formatDateTime } from "./utils";
import { businessInfo } from "./settings";
import { getActiveTermsVersion } from "./data";

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = "—") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

/** Hard ceiling on a generated report. See generateInspectionPdf's retry logic below —
 * this is checked, not assumed; a PDF over budget after every optimization step fails
 * loudly (PdfTooLargeError) rather than being uploaded oversized or silently degraded. */
export const MAX_PDF_BYTES = 800 * 1024;

export class PdfTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTooLargeError";
  }
}

/** Each step is a deliberately modest degradation from the last — not a blind size
 * chase — chosen so scratches, dents, the odometer and the fuel gauge stay legible.
 * Every photo is always still embedded; only its resolution/quality steps down. */
const PDF_EMBED_SHRINK_STEPS = [
  { width: 1400, quality: 65 },
  { width: 1100, quality: 50 },
  { width: 900, quality: 40 },
] as const;

/**
 * Recompresses an already-downloaded image buffer for PDF EMBEDDING ONLY — this never
 * touches the Storage original, which stays at its uploaded quality for evidentiary
 * purposes. Only called when a render already exceeded MAX_PDF_BYTES.
 *
 * pdfkit embeds JPEG bytes verbatim — it does not recompress on the way in — so the
 * only way to shrink a PDF built from already-compressed evidence photos is to
 * re-encode a second, smaller copy specifically for this PDF.
 */
async function shrinkForPdfEmbed(buf: Buffer, step: (typeof PDF_EMBED_SHRINK_STEPS)[number]): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buf)
    .rotate() // apply EXIF orientation before the resize drops the EXIF block
    .resize({ width: step.width, height: step.width, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: step.quality })
    .toBuffer();
}

const DEFAULT_BOOKING_TERMS = [
  "1. Valid original Driving Licence & Government ID (Aadhaar/Passport) mandatory for vehicle handover.",
  "2. Included drive limit applies per 24-hour rental day. Driving beyond the limit is charged at extra km rates.",
  "3. Fuel Policy: Vehicle must be returned with the same fuel level as provided at pickup.",
  "4. Security Deposit: Refundable upon safe return of vehicle subject to fuel check & zero damage.",
  "5. Rental Boundary & Late Fee: Return time is strict. Dropping after scheduled time incurs late charges.",
  "6. Damage & Accident Protocol: Notify rental management immediately in case of any breakdown or incident.",
  "7. Traffic Challans: Customer is solely liable for any traffic fines, tolls, or violations during custody.",
  "8. Misuse: Sub-renting or commercial ferrying by unauthorized third parties is strictly prohibited.",
];

function formatPdfINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const numVal = Math.round(Number(value));
  return `Rs. ${numVal.toLocaleString("en-IN")}`;
}

function normalizePhotoSide(rawSide: unknown): "front" | "rear" | "left" | "right" | "odometer" | "fuel" | "damage" | null {
  if (!rawSide) return null;
  const s = String(rawSide).toLowerCase().trim().replace(/[-_ ]+/g, "");
  if (s.includes("front")) return "front";
  if (s.includes("rear") || s.includes("back")) return "rear";
  if (s.includes("left")) return "left";
  if (s.includes("right")) return "right";
  if (s.includes("odo") || s.includes("meter") || s.includes("dash") || s.includes("speedo") || s.includes("km")) return "odometer";
  if (s.includes("fuel") || s.includes("cluster") || s.includes("gauge") || s.includes("tank")) return "fuel";
  if (s.includes("damage") || s.includes("scratch") || s.includes("dent")) return "damage";
  return null;
}

/**
 * Robust image loader that resolves image bytes from local disk, Supabase Storage,
 * Base64 data URIs, and remote HTTPS URLs.
 */
async function loadPhotoBytes(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || typeof url !== "string") return null;
  const cleanUrl = url.trim();
  if (!cleanUrl) return null;

  try {
    // 1. Data URL (Base64)
    if (cleanUrl.startsWith("data:image/")) {
      const match = cleanUrl.match(/^data:image\/[a-z0-9+]+;base64,(.+)$/i);
      if (match && match[1]) {
        return Buffer.from(match[1], "base64");
      }
    }

    // 2. /api/files/doc or /api/files/media with ?p= parameter
    if (cleanUrl.includes("/api/files/doc") || cleanUrl.includes("/api/files/media") || cleanUrl.includes("/api/files/private")) {
      try {
        const parsed = new URL(cleanUrl, "http://localhost");
        const key = parsed.searchParams.get("p") ?? "";
        if (key && isSafeStoragePath(key) && supabaseAdmin) {
          // "media" was a bucket that has never existed in this project — that branch
          // always 404'd. The public bucket is the real counterpart to the private one.
          const bucket = cleanUrl.includes("/doc") ? PRIVATE_DOCS_BUCKET : PUBLIC_MEDIA_BUCKET;
          const { data, error } = await supabaseAdmin.storage.from(bucket).download(key);
          if (!error && data) return Buffer.from(await data.arrayBuffer());
        }
      } catch {}
    }

    // 3. /api/files/ or direct subpath
    const subPath = cleanUrl
      .replace(/^\/api\/files\//, "")
      .replace(/^api\/files\//, "")
      .replace(/^\/+/, "")
      .replace(/\?.*$/, "");

    if (subPath && isSafeStoragePath(subPath)) {
      // Try local disk in multiple potential upload & data directories
      const possibleLocalDirs = [
        getWritableUploadsDir(),
        path.join(process.cwd(), "data", "uploads"),
        path.join(process.cwd(), "public", "uploads"),
        path.join(process.cwd(), "public"),
        path.join(process.cwd(), "..", "web", "public"),
        path.join(process.cwd(), "uploads"),
      ];

      for (const baseDir of possibleLocalDirs) {
        try {
          const localPath = path.join(baseDir, subPath);
          if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
            return fs.readFileSync(localPath);
          }
        } catch {}
      }

      // Try Supabase Storage buckets.
      //
      // This used to walk ["vehicle-photos", "media", "customer-documents",
      // "inspections", PRIVATE_DOCS_BUCKET] — five sequential download attempts, of
      // which "media" and "inspections" are buckets that do not exist in this project
      // (only vehicle-photos and customer-documents do), and PRIVATE_DOCS_BUCKET *is*
      // "customer-documents", so it was tried twice. A single PDF embeds up to 13
      // images, so a report could fire ~65 Storage round trips to fetch 13 files, each
      // failed attempt still costing a request and a wait. Only the two real buckets
      // are tried now, public first (inspection photos live there and are the common
      // case), private second.
      if (supabaseAdmin) {
        for (const b of [PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET]) {
          try {
            const { data, error } = await supabaseAdmin.storage.from(b).download(subPath);
            if (!error && data) return Buffer.from(await data.arrayBuffer());
          } catch {}
        }
      }
    }

    // 4. Remote HTTP/HTTPS URL (Supabase Public Storage or CDN)
    if (/^https?:\/\//i.test(cleanUrl)) {
      // If it's a Supabase storage URL, try direct SDK download first for speed & reliability
      if (supabaseAdmin && cleanUrl.includes(".supabase.co/storage/v1/object/")) {
        const storageMatch = cleanUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
        if (storageMatch && storageMatch[1] && storageMatch[2]) {
          const bucket = storageMatch[1];
          const pathKey = storageMatch[2].split("?")[0];
          try {
            const { data, error } = await supabaseAdmin.storage.from(bucket).download(pathKey);
            if (!error && data) return Buffer.from(await data.arrayBuffer());
          } catch {}
        }
      }

      const res = await fetch(cleanUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (res && res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    }

    // 5. Local public file (e.g. /vehicles/tvs-jupiter.jpg or /logo.png)
    if (cleanUrl.startsWith("/")) {
      const pubPath = path.join(process.cwd(), "public", cleanUrl.replace(/^\//, ""));
      if (fs.existsSync(pubPath) && fs.statSync(pubPath).isFile()) {
        return fs.readFileSync(pubPath);
      }
      const webPubPath = path.join(process.cwd(), "..", "web", "public", cleanUrl.replace(/^\//, ""));
      if (fs.existsSync(webPubPath) && fs.statSync(webPubPath).isFile()) {
        return fs.readFileSync(webPubPath);
      }
    }

    return null;
  } catch (err) {
    console.error("[inspection-pdf] photo load failed for", url, err);
    return null;
  }
}

function bookingRefFilter(bookingRef: number | string): string {
  const rawRef = String(bookingRef).trim();
  return /^\d+$/.test(rawRef)
    ? `or=(id.eq.${rawRef},booking_no.eq.${rawRef},booking_no.eq.BK-${rawRef})`
    : `or=(booking_no.eq.${encodeURIComponent(rawRef)},booking_no.eq.${encodeURIComponent(rawRef.replace(/^BK-/i, ""))})`;
}

/** Resolves a booking reference (numeric id OR booking_no, with/without the "BK-"
 * prefix — same acceptance rules as generateInspectionPdf) to its real numeric id,
 * with a single-column select. Lets the route check for an already-stored PDF
 * artifact BEFORE paying for the full booking/inspection/photo load below. */
export async function resolveBookingId(bookingRef: number | string): Promise<number | null> {
  const res = await sbSelectOne<{ id: number }>("bookings", `select=id&${bookingRefFilter(bookingRef)}`);
  if (!res.ok || !res.data) return null;
  return Number(res.data.id);
}

/**
 * Generates an authoritative, print-ready Vehicle Handover or Return Inspection Report PDF.
 */
export async function generateInspectionPdf(
  bookingRef: number | string,
  mode: "handover" | "return" = "handover"
): Promise<Buffer> {
  const bookingRes = await sbSelectOne<Row>(
    "bookings",
    `select=*,customers(name,phone,email,address,city),vehicles(name,brand,model,registration_no,included_km,extra_km_rate)&${bookingRefFilter(bookingRef)}`
  );

  if (!bookingRes.ok) {
    console.error("[inspection-pdf] booking query failed:", bookingRes.error);
    throw new Error(`Could not load booking: ${bookingRes.error}`);
  }
  if (!bookingRes.data) {
    throw new Error(`Booking ${bookingRef} not found.`);
  }

  const b = bookingRes.data;
  const bookingId = Number(b.id);

  const [inspectionsRes, paymentsRes, documentsRes, termsRes, biz] = await Promise.all([
    sbSelect<Row>(
      "inspections",
      `select=*&booking_id=eq.${bookingId}&order=created_at.asc`
    ),
    sbSelect<Row>(
      "payments",
      `select=*&booking_id=eq.${bookingId}&order=created_at.asc`
    ),
    sbSelect<Row>(
      "customer_documents",
      `select=*&booking_id=eq.${bookingId}&order=created_at.asc`
    ),
    getActiveTermsVersion(),
    businessInfo(),
  ]);

  const customer = (b.customers as Row | null) ?? {};
  const vehicle = (b.vehicles as Row | null) ?? {};

  const inspections = inspectionsRes.ok ? inspectionsRes.data : [];
  const handoverInsp = inspections.find((i) => i.kind === "handover") || (mode === "handover" ? inspections[0] : null);
  const returnInsp = inspections.find((i) => i.kind === "return") || (mode === "return" ? inspections[inspections.length - 1] : null);

  // Fetch photos across all inspections recorded for this booking
  const allInspIds = inspections.map((i) => Number(i.id)).filter((id) => Number.isInteger(id) && id > 0);
  let allInspectionPhotos: Row[] = [];
  if (allInspIds.length > 0) {
    const photosRes = await sbSelect<Row>(
      "inspection_photos",
      `select=*&or=(${allInspIds.map((id) => `inspection_id.eq.${id}`).join(",")})&order=created_at.asc`
    );
    if (photosRes.ok) {
      allInspectionPhotos = photosRes.data;
    }
  }

  const documents = documentsRes.ok ? documentsRes.data : [];

  // 1. Map Handover Photos (6 Slots)
  const handoverPhotos = handoverInsp
    ? allInspectionPhotos.filter((p) => Number(p.inspection_id) === Number(handoverInsp.id))
    : allInspectionPhotos;

  const handoverSides: Record<string, string> = {
    front: "",
    rear: "",
    left: "",
    right: "",
    odometer: "",
    fuel: "",
  };

  for (const p of handoverPhotos) {
    const side = normalizePhotoSide(p.side);
    if (side && side in handoverSides && p.url && !handoverSides[side]) {
      handoverSides[side] = String(p.url);
    }
  }

  // Fallback: check customer_documents for initial inspection/odometer photos
  for (const d of documents) {
    const side = normalizePhotoSide(d.kind || d.type || d.number);
    if (side && side in handoverSides && !handoverSides[side] && d.file_path) {
      handoverSides[side] = String(d.file_path);
    }
  }

  // 2. Map Return Photos (6 Slots)
  const returnPhotos = returnInsp
    ? allInspectionPhotos.filter((p) => Number(p.inspection_id) === Number(returnInsp.id))
    : [];

  const returnSides: Record<string, string> = {
    front: "",
    rear: "",
    left: "",
    right: "",
    odometer: "",
    fuel: "",
  };

  for (const p of returnPhotos) {
    const side = normalizePhotoSide(p.side);
    if (side && side in returnSides && p.url && !returnSides[side]) {
      returnSides[side] = String(p.url);
    }
  }

  // Find customer signature document/image if uploaded
  const signatureDoc = documents.find(
    (d) =>
      String(d.kind).toLowerCase() === "signature" ||
      String(d.number || "").includes("SIGNED-HANDOVER") ||
      String(d.file_path || "").toLowerCase().includes("signature") ||
      String(d.file_path || "").toLowerCase().includes("signed_agreements")
  );

  // Load photos and signature concurrently — a network-bound step, done ONCE regardless
  // of whether the PDF needs a size-optimization retry below (only the pdfkit render
  // and, if needed, an in-memory recompression of these already-downloaded bytes is
  // repeated — never a second round of Storage downloads).
  const rawPhotoBytes = await Promise.all([
    loadPhotoBytes(handoverSides.front),
    loadPhotoBytes(handoverSides.rear),
    loadPhotoBytes(handoverSides.left),
    loadPhotoBytes(handoverSides.right),
    loadPhotoBytes(handoverSides.odometer),
    loadPhotoBytes(handoverSides.fuel),
    loadPhotoBytes(returnSides.front),
    loadPhotoBytes(returnSides.rear),
    loadPhotoBytes(returnSides.left),
    loadPhotoBytes(returnSides.right),
    loadPhotoBytes(returnSides.odometer),
    loadPhotoBytes(returnSides.fuel),
    signatureDoc?.file_path ? loadPhotoBytes(String(signatureDoc.file_path)) : Promise.resolve(null),
  ]);

  const payments = paymentsRes.ok ? paymentsRes.data : [];

  const totalAmount = num(b.total_amount);
  const paidAmount = num(b.paid_amount);
  const balanceDue = Math.max(0, totalAmount - paidAmount);
  const depositAmount = num(b.deposit_amount);

  const startOdo = handoverInsp?.odometer ? num(handoverInsp.odometer) : (b.start_odometer ? num(b.start_odometer) : null);
  const endOdo = returnInsp?.odometer ? num(returnInsp.odometer) : (b.end_odometer ? num(b.end_odometer) : null);
  const totalKmDriven = startOdo !== null && endOdo !== null ? Math.max(0, endOdo - startOdo) : null;
  const includedKm = num(b.included_km, num(vehicle.included_km, 0));
  const extraKm = totalKmDriven !== null && includedKm > 0 ? Math.max(0, totalKmDriven - includedKm) : 0;

  const isReturnMode = mode === "return";
  const reportCode = isReturnMode ? "RET" : "HAND";
  const reportId = `INSP-${reportCode}-${str(b.booking_no, String(bookingId))}-${(isReturnMode ? returnInsp?.id : handoverInsp?.id) ?? "01"}`;
  const nowStamp = formatDateTime(new Date().toISOString());

  const handoverTimestamp = handoverInsp?.created_at
    ? formatDateTime(String(handoverInsp.created_at))
    : (b.actual_pickup_at ? formatDateTime(String(b.actual_pickup_at)) : nowStamp);

  const returnTimestamp = returnInsp?.created_at
    ? formatDateTime(String(returnInsp.created_at))
    : (b.actual_return_at ? formatDateTime(String(b.actual_return_at)) : nowStamp);

  const pickupScheduled = formatDateTime(String(b.pickup_at));
  const returnScheduled = formatDateTime(String(b.return_at));
  const actualPickupTime = b.actual_pickup_at
    ? formatDateTime(String(b.actual_pickup_at))
    : handoverTimestamp;
  const actualReturnTime = b.actual_return_at
    ? formatDateTime(String(b.actual_return_at))
    : returnTimestamp;

  const termsList =
    termsRes?.content && termsRes.content.length > 0
      ? termsRes.content
      : DEFAULT_BOOKING_TERMS;

  const designatedHandoverStaff = (handoverInsp?.users as Row | undefined);
  const handoverStaffName = str(designatedHandoverStaff?.name, "Designated Handover Officer");
  const handoverStaffRole = str(designatedHandoverStaff?.role, "Fleet Handover Specialist");

  const designatedReturnStaff = (returnInsp?.users as Row | undefined);
  const returnStaffName = str(designatedReturnStaff?.name, "Designated Return Officer");
  const returnStaffRole = str(designatedReturnStaff?.role, "Fleet Return Auditor");

  const docSummary = documents.length > 0
    ? documents
        .map((d) => {
          const k = String(d.kind || d.type || "ID Proof").replace(/_/g, " ").toUpperCase();
          const numTag = d.number ? ` (#${d.number})` : "";
          const isVerified = d.verified === 1 ? " [Verified]" : " [Submitted]";
          return `${k}${numTag}${isVerified}`;
        })
        .join(" · ")
    : "Driving Licence & Government ID (Verified on Mobile Portal)";

  // Format Payment & UPI ID line
  const paidPayments = payments.filter((p) => String(p.status).toLowerCase() === "paid");
  const latestPayment = paidPayments[paidPayments.length - 1] || payments[payments.length - 1];

  let upiAddress = (latestPayment?.upi_id as string) || (latestPayment?.vpa as string) || null;
  let pmtMethod = str(latestPayment?.method, "Online UPI").toUpperCase();
  let txnRef = str(latestPayment?.razorpay_payment_id || latestPayment?.gateway_ref, "TXN-OK");
  const pmtTime = latestPayment?.created_at ? ` on ${formatDateTime(String(latestPayment.created_at))}` : "";

  const rzpPayId = String(latestPayment?.razorpay_payment_id || "").trim();
  const rzpOrderId = String(latestPayment?.razorpay_order_id || latestPayment?.gateway_ref || "").trim();

  if ((!upiAddress || !latestPayment?.razorpay_payment_id) && (rzpPayId.startsWith("pay_") || rzpOrderId.startsWith("order_"))) {
    try {
      const { fetchRazorpayPayment, fetchRazorpayOrderPayments } = await import("./razorpay");

      let fetchedPayment: { id?: string; vpa?: string | null; method?: string; upi?: { vpa?: string } } | null = null;
      if (rzpPayId.startsWith("pay_")) {
        const rzpRes = await fetchRazorpayPayment(rzpPayId);
        if (rzpRes.ok) fetchedPayment = rzpRes.payment;
      } else if (rzpOrderId.startsWith("order_")) {
        const orderRes = await fetchRazorpayOrderPayments(rzpOrderId);
        if (orderRes.ok && orderRes.payments.length > 0) {
          fetchedPayment = orderRes.payments[0];
        }
      }

      if (fetchedPayment) {
        upiAddress = fetchedPayment.vpa || fetchedPayment.upi?.vpa || upiAddress;
        if (fetchedPayment.method) {
          pmtMethod = fetchedPayment.method.toLowerCase() === "upi" ? "UPI" : fetchedPayment.method.toUpperCase();
        }
        if (fetchedPayment.id) {
          txnRef = fetchedPayment.id;
        }
        if (latestPayment?.id && (upiAddress || fetchedPayment.id)) {
          sbUpdate("payments", `id=eq.${latestPayment.id}`, {
            ...(upiAddress ? { upi_id: upiAddress, vpa: upiAddress } : {}),
            ...(fetchedPayment.id ? { razorpay_payment_id: fetchedPayment.id, gateway_ref: fetchedPayment.id } : {}),
            ...(fetchedPayment.method ? { method: pmtMethod } : {}),
          }).catch(() => {});
        }
      }
    } catch {}
  }

  const isUpiPayment = pmtMethod.includes("UPI") || !!upiAddress;

  let pmtDetail = "Payment recorded via authorized cashier terminal";
  if (latestPayment) {
    const methodDisplay = isUpiPayment
      ? `Online UPI ${upiAddress ? `(UPI ID: ${upiAddress})` : ""}`.trim()
      : str(latestPayment.method, "Card/Cash");
    pmtDetail = `Payment: ${methodDisplay} · Status: ${str(latestPayment.status, "Paid")} · Ref: ${txnRef}${pmtTime}`;
  }

  // Renders the report from a given set of (already-downloaded) photo bytes. Called
  // once normally; called a second time, with the SAME layout code, only when the
  // first attempt comes back over MAX_PDF_BYTES — the retry passes in-memory
  // recompressed copies of the same bytes, never re-fetching from Storage.
  function render(photoBytes: Array<Buffer | null>): Promise<Buffer> {
    const [
      hFrontBytes, hRearBytes, hLeftBytes, hRightBytes, hOdoBytes, hFuelBytes,
      rFrontBytes, rRearBytes, rLeftBytes, rRightBytes, rOdoBytes, rFuelBytes,
      customerSigBytes,
    ] = photoBytes;

    return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 20, bottom: 20, left: 30, right: 30 },
      info: {
        Title: `${isReturnMode ? "Vehicle Return & Settlement Report" : "Vehicle Handover & Inspection Report"} - ${b.booking_no}`,
        Author: "Darshh Holiday",
        Subject: isReturnMode ? "Vehicle Return & Drop-Off Audit" : "Vehicle Handover & Inspection Audit",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const left = 30;
    const pageWidth = 595.28 - 60; // 535.28 pt printable width

    // Helper: Draw 6-slot photo grid
    const draw6SlotPhotoGrid = (
      startY: number,
      title: string,
      photos: Array<{ key: string; label: string; bytes: Buffer | null; col: number; row: number; tag: string; isHighlight?: boolean }>
    ) => {
      const pBoxH = 194;
      doc.roundedRect(left, startY, pageWidth, pBoxH, 4).lineWidth(0.75).strokeColor("#E2E8F0").stroke();
      doc.rect(left, startY, pageWidth, 15).fill("#F8FAFC");
      doc.fillColor("#1E293B").fontSize(7.5).font("Helvetica-Bold").text(title, left + 7, startY + 4);

      const slotCols = 3;
      const slotGap = 6;
      const slotW = (pageWidth - 14 - slotGap * (slotCols - 1)) / slotCols;
      const slotH = 83;

      for (const slot of photos) {
        const sx = left + 7 + slot.col * (slotW + slotGap);
        const sy = startY + 18 + slot.row * (slotH + 4);

        doc.roundedRect(sx, sy, slotW, slotH, 3).lineWidth(0.5).strokeColor(slot.isHighlight ? "#38BDF8" : "#CBD5E1").stroke();
        doc.rect(sx, sy, slotW, 12).fill(slot.isHighlight ? "#F0F9FF" : "#F8FAFC");

        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(slot.isHighlight ? "#0369A1" : "#475569").text(
          slot.label,
          sx + 4,
          sy + 3,
          { width: slotW - 8, height: 9, ellipsis: true }
        );

        if (slot.bytes && slot.bytes.length > 0) {
          try {
            doc.image(slot.bytes, sx + 3, sy + 14, {
              fit: [slotW - 6, slotH - 16],
              align: "center",
              valign: "center",
            });
          } catch {
            doc.rect(sx + 3, sy + 14, slotW - 6, slotH - 16).fill("#F1F5F9");
            doc.fontSize(6.5).font("Helvetica-Oblique").fillColor("#64748B").text("Photo recorded in CRM", sx + 6, sy + 36, { align: "center", width: slotW - 12 });
          }
        } else {
          doc.rect(sx + 3, sy + 14, slotW - 6, slotH - 16).fill("#F8FAFC");
          doc.fontSize(6.5).font("Helvetica-Oblique").fillColor("#94A3B8").text(
            `Verified physically on\nmobile scanner\n(${slot.tag})`,
            sx + 6,
            sy + 30,
            { align: "center", width: slotW - 12 }
          );
        }
      }

      return startY + pBoxH + 6;
    };

    // =========================================================================
    // PAGE 1: BOOKING DETAILS, PAYMENT (WITH UPI ID), PICKUP IMAGES, TERMS & PICKUP SIGNATURES
    // =========================================================================

    // 1. Header Banner
    doc.rect(left, 20, pageWidth, 44).fill("#0F172A");

    doc.fillColor("#FFFFFF").fontSize(12).font("Helvetica-Bold");
    doc.text("DARSHH HOLIDAY", left + 10, 26);
    doc.fontSize(7).font("Helvetica").fillColor("#94A3B8");
    doc.text("Self-Drive Rentals & Tour Services · Sakleshpur & Hassan, Karnataka", left + 10, 40);
    doc.fontSize(6.5).fillColor("#64748B");
    doc.text(`Generated: ${nowStamp}`, left + 10, 50);

    const docMainTitle = isReturnMode
      ? "VEHICLE RETURN & DROP-OFF VERIFICATION REPORT"
      : "VEHICLE HANDOVER & INSPECTION REPORT";

    doc.fillColor("#38BDF8").fontSize(9).font("Helvetica-Bold");
    doc.text(docMainTitle, left + pageWidth - 270, 26, { width: 260, align: "right" });
    doc.fontSize(7.5).font("Helvetica").fillColor("#CBD5E1");
    doc.text(`Booking Ref: ${str(b.booking_no)}`, left + pageWidth - 270, 39, { width: 260, align: "right" });
    doc.fontSize(6.5).font("Helvetica").fillColor("#94A3B8");
    doc.text(`Handover Date: ${actualPickupTime}`, left + pageWidth - 270, 50, { width: 260, align: "right" });

    let y = 68;

    // 2. Customer & Rental Booking Summary (Two Columns)
    const colGap = 8;
    const colWidth = (pageWidth - colGap) / 2;

    // Left Column: Customer Details Box
    doc.roundedRect(left, y, colWidth, 86, 4).lineWidth(0.75).strokeColor("#E2E8F0").stroke();
    doc.rect(left, y, colWidth, 15).fill("#F8FAFC");
    doc.fillColor("#1E293B").fontSize(7.5).font("Helvetica-Bold").text("CUSTOMER & ID PROOF DETAILS", left + 7, y + 4);

    let cy = y + 18;
    const drawCustomerRow = (label: string, value: string, isMultiline = false) => {
      doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#64748B").text(label, left + 7, cy, { width: 75 });
      doc.font("Helvetica").fillColor("#0F172A").text(value, left + 82, cy, {
        width: colWidth - 88,
        height: isMultiline ? 22 : 10,
        ellipsis: isMultiline,
      });
      cy += isMultiline ? 20 : 11;
    };

    drawCustomerRow("Customer Name:", str(customer.name));
    drawCustomerRow("Phone / WhatsApp:", str(customer.phone));
    drawCustomerRow("Email Address:", str(customer.email, "N/A"));
    drawCustomerRow("City / Address:", `${str(customer.city, "")} ${str(customer.address, "")}`.trim() || "—");
    drawCustomerRow("ID Proofs Status:", docSummary, true);

    // Right Column: Booking & Vehicle Info Box
    const rightCol = left + colWidth + colGap;
    doc.roundedRect(rightCol, y, colWidth, 86, 4).lineWidth(0.75).strokeColor("#E2E8F0").stroke();
    doc.rect(rightCol, y, colWidth, 15).fill("#F8FAFC");
    doc.fillColor("#1E293B").fontSize(7.5).font("Helvetica-Bold").text(
      "VEHICLE & TIMINGS SCHEDULE",
      rightCol + 7,
      y + 4
    );

    let by = y + 18;
    const drawVehicleRow = (label: string, value: string) => {
      doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#64748B").text(label, rightCol + 7, by, { width: 75 });
      doc.font("Helvetica").fillColor("#0F172A").text(value, rightCol + 82, by, { width: colWidth - 88, height: 10 });
      by += 11;
    };

    const plateNo = str(vehicle.registration_no, "—");
    drawVehicleRow("Vehicle Model:", str(vehicle.name));
    drawVehicleRow("Unit & Plate No:", `Plate: ${plateNo}`);
    drawVehicleRow("Pickup Schedule:", `${actualPickupTime}`);
    drawVehicleRow("Return Schedule:", isReturnMode ? `${actualReturnTime}` : returnScheduled);
    drawVehicleRow("Handover / Odo:", `${actualPickupTime} · ${startOdo ? `${startOdo} km` : "—"} (Fuel: ${str(handoverInsp?.fuel_level, "Full")})`);

    y += 92;

    // 3. Authoritative Financial & Payment Ledger Table (With Prominent UPI ID)
    const ledgerHeight = 52;
    doc.roundedRect(left, y, pageWidth, ledgerHeight, 4).lineWidth(0.75).strokeColor("#E2E8F0").stroke();
    doc.rect(left, y, pageWidth, 15).fill("#F8FAFC");
    doc.fillColor("#1E293B").fontSize(7.5).font("Helvetica-Bold").text(
      "FINANCIAL & PAYMENT AUDIT LEDGER",
      left + 7,
      y + 4
    );

    const fColW = pageWidth / 4;
    const py = y + 18;

    // Total Amount
    doc.fontSize(6).font("Helvetica").fillColor("#64748B").text("Total Rental Fee", left + 8, py);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#0F172A").text(formatPdfINR(totalAmount), left + 8, py + 8);

    // Paid Amount
    doc.fontSize(6).font("Helvetica").fillColor("#64748B").text("Advance Paid Online", left + fColW + 6, py);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#15803D").text(formatPdfINR(paidAmount), left + fColW + 6, py + 8);

    // Balance Amount
    doc.fontSize(6).font("Helvetica").fillColor("#64748B").text("Balance Due at Pickup", left + fColW * 2 + 6, py);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(balanceDue > 0 ? "#B91C1C" : "#0F172A").text(formatPdfINR(balanceDue), left + fColW * 2 + 6, py + 8);

    // Security Deposit
    doc.fontSize(6).font("Helvetica").fillColor("#64748B").text("Security Deposit (Refundable)", left + fColW * 3 + 6, py);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#D97706").text(formatPdfINR(depositAmount), left + fColW * 3 + 6, py + 8);

    // Prominent Payment method & UPI ID line
    doc.rect(left + 1, y + ledgerHeight - 14, pageWidth - 2, 13).fill("#F1F5F9");
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(isUpiPayment ? "#1E3A8A" : "#334155");
    doc.text(`Payment Audit: ${pmtDetail}`, left + 8, y + ledgerHeight - 11, { width: pageWidth - 16, height: 10, ellipsis: true });

    y += ledgerHeight + 6;

    // 4. Phase 1: Handover / Pickup Inspection Photographs Grid (6 Slots)
    const hOdoReading = startOdo ? `${startOdo} KM` : "ODOMETER";
    const handoverSlotList = [
      { key: "front", label: "FRONT VIEW (PICKUP)", bytes: hFrontBytes, col: 0, row: 0, tag: "Front bumper & lights" },
      { key: "rear", label: "REAR / BACK VIEW (PICKUP)", bytes: hRearBytes, col: 1, row: 0, tag: "Rear bumper & lights" },
      { key: "left", label: "LEFT SIDE PROFILE (PICKUP)", bytes: hLeftBytes, col: 2, row: 0, tag: "Left door & panels" },
      { key: "right", label: "RIGHT SIDE PROFILE (PICKUP)", bytes: hRightBytes, col: 0, row: 1, tag: "Right door & panels" },
      { key: "odometer", label: `ODOMETER AT PICKUP (${hOdoReading})`, bytes: hOdoBytes, col: 1, row: 1, tag: "Dashboard km counter", isHighlight: true },
      { key: "fuel", label: `FUEL AT PICKUP (${str(handoverInsp?.fuel_level, "Full")})`, bytes: hFuelBytes, col: 2, row: 1, tag: "Instrument cluster" },
    ];

    y = draw6SlotPhotoGrid(
      y,
      "VEHICLE PICKUP / HANDOVER INSPECTION PHOTOGRAPHS (6-SLOT VERIFICATION)",
      handoverSlotList
    );

    // 5. Terms & Conditions Box (Matching Booking Form)
    const termsBoxH = 68;
    doc.roundedRect(left, y, pageWidth, termsBoxH, 3).lineWidth(0.5).strokeColor("#CBD5E1").fillColor("#F8FAFC").fillAndStroke();
    doc.fillColor("#0F172A").fontSize(7).font("Helvetica-Bold").text("RENTAL TERMS & CONDITIONS (ACCEPTED AT BOOKING / PICKUP)", left + 7, y + 4.5);

    let ty = y + 14;
    doc.font("Helvetica").fontSize(5.5).fillColor("#334155");

    for (let i = 0; i < Math.min(8, termsList.length); i++) {
      const clause = termsList[i];
      const bullet = `${clause.startsWith(`${i + 1}.`) ? "" : `${i + 1}. `}${clause}`;
      doc.text(bullet, left + 7, ty, { width: pageWidth - 14, lineGap: 0.5 });
      ty += 6.5;
    }

    y += termsBoxH + 6;

    // 6. Pickup Signatures & Uploaded Customer Signature Block
    const sigBoxW = (pageWidth - colGap) / 2;
    const sigBoxH = 68;

    // Left Side: Designated Staff Officer Handover Signature Block
    doc.roundedRect(left, y, sigBoxW, sigBoxH, 3).lineWidth(0.75).strokeColor("#CBD5E1").stroke();
    doc.rect(left, y, sigBoxW, 14).fill("#F1F5F9");
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#0F172A").text("DESIGNATED HANDOVER OFFICER (STAFF)", left + 7, y + 3.5);

    doc.fontSize(6.5).font("Helvetica").fillColor("#334155");
    doc.text(`Staff Officer: ${handoverStaffName} (${handoverStaffRole})`, left + 7, y + 17);
    doc.text(`Handover Date & Time: ${actualPickupTime}`, left + 7, y + 26);
    doc.text("I confirm inspection completion and physical key handover.", left + 7, y + 35, { width: sigBoxW - 14 });
    doc.text("Officer Signature: _________________________________", left + 7, y + 52);

    // Right Side: Customer Handover Signature & Acknowledgment Block
    doc.roundedRect(rightCol, y, sigBoxW, sigBoxH, 3).lineWidth(0.75).strokeColor("#CBD5E1").stroke();
    doc.rect(rightCol, y, sigBoxW, 14).fill("#F1F5F9");
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#0F172A").text("CUSTOMER HANDOVER ACKNOWLEDGMENT & SIGNATURE", rightCol + 7, y + 3.5);

    doc.fontSize(6.5).font("Helvetica").fillColor("#334155");
    doc.text(`Customer: ${str(customer.name)} (${str(customer.phone)})`, rightCol + 7, y + 17);
    doc.text(`Acknowledgment Date: ${actualPickupTime}`, rightCol + 7, y + 26);

    if (customerSigBytes && customerSigBytes.length > 0) {
      try {
        doc.image(customerSigBytes, rightCol + 7, y + 36, {
          fit: [sigBoxW - 14, 22],
          align: "center",
          valign: "center",
        });
        doc.fontSize(5.5).font("Helvetica-Bold").fillColor("#059669").text("✓ Verified Physical Customer Signature on Record", rightCol + 7, y + 58);
      } catch {
        doc.text("✓ Customer Signature on File at Handover", rightCol + 7, y + 38);
        doc.fontSize(6.5).font("Helvetica-Oblique").fillColor("#64748B").text("Archived Pickup Digital Signature", rightCol + 7, y + 52);
      }
    } else {
      doc.text("I agree to the 6-slot photos, initial km readout & rental terms.", rightCol + 7, y + 35, { width: sigBoxW - 14 });
      doc.text("Customer Signature: _________________________________", rightCol + 7, y + 52);
    }

    if (!isReturnMode) {
      // Single-Page Footer for Handover Report
      doc.fontSize(6).font("Helvetica").fillColor("#94A3B8").text(
        `Darshh Holiday Rental Management System · Record: ${reportId} · Page 1 of 1 · All rights reserved`,
        left,
        y + sigBoxH + 4,
        { width: pageWidth, align: "center" }
      );
    } else {
      // Multi-Page Footer for Return Report
      doc.fontSize(6).font("Helvetica").fillColor("#94A3B8").text(
        `Darshh Holiday Return Audit · Record: ${reportId} · Page 1 of 2 (Turn over for Return Photos & Drop-off Signatures)`,
        left,
        y + sigBoxH + 4,
        { width: pageWidth, align: "center" }
      );

      // =======================================================================
      // PAGE 2: DROP-OFF INSPECTION IMAGES, RETURN DECLARATION & FRESH DROP-OFF SIGNATURES
      // =======================================================================
      doc.addPage();

      let y2 = 20;

      // Page 2 Header Banner
      doc.rect(left, y2, pageWidth, 36).fill("#0F172A");
      doc.fillColor("#FFFFFF").fontSize(11).font("Helvetica-Bold");
      doc.text("DARSHH HOLIDAY — VEHICLE DROP-OFF & RETURN AUDIT", left + 10, y2 + 8);
      doc.fontSize(7).font("Helvetica").fillColor("#94A3B8");
      doc.text(`Booking: ${str(b.booking_no)} · Plate: ${plateNo} · Customer: ${str(customer.name)}`, left + 10, y2 + 22);

      doc.fillColor("#38BDF8").fontSize(8.5).font("Helvetica-Bold");
      doc.text("PAGE 2 OF 2 — DROP-OFF VERIFICATION", left + pageWidth - 240, y2 + 8, { width: 230, align: "right" });
      doc.fontSize(6.5).font("Helvetica").fillColor("#CBD5E1");
      doc.text(`Return Time: ${actualReturnTime}`, left + pageWidth - 240, y2 + 22, { width: 230, align: "right" });

      y2 += 44;

      // Phase 2: Drop-Off Return Inspection Photographs Grid (6 Slots)
      const rOdoReading = endOdo ? `${endOdo} KM` : "FINAL ODOMETER";
      const returnSlotList = [
        { key: "front", label: "RETURN: FRONT VIEW", bytes: rFrontBytes, col: 0, row: 0, tag: "Front bumper & lights at return" },
        { key: "rear", label: "RETURN: REAR / BACK VIEW", bytes: rRearBytes, col: 1, row: 0, tag: "Rear bumper & lights at return" },
        { key: "left", label: "RETURN: LEFT PROFILE", bytes: rLeftBytes, col: 2, row: 0, tag: "Left door & panels at return" },
        { key: "right", label: "RETURN: RIGHT PROFILE", bytes: rRightBytes, col: 0, row: 1, tag: "Right door & panels at return" },
        { key: "odometer", label: `FINAL ODOMETER (${rOdoReading})`, bytes: rOdoBytes, col: 1, row: 1, tag: "Dashboard km counter at return", isHighlight: true },
        { key: "fuel", label: `RETURN FUEL (${str(returnInsp?.fuel_level, "Full")})`, bytes: rFuelBytes, col: 2, row: 1, tag: "Instrument cluster at return" },
      ];

      y2 = draw6SlotPhotoGrid(
        y2,
        "VEHICLE DROP-OFF / RETURN INSPECTION PHOTOGRAPHS (6-SLOT VERIFICATION)",
        returnSlotList
      );

      // Return Condition & Deposit Settlement Acknowledgment Box
      const decBoxH = 46;
      doc.roundedRect(left, y2, pageWidth, decBoxH, 3).lineWidth(0.5).strokeColor("#CBD5E1").fillColor("#F8FAFC").fillAndStroke();
      doc.fillColor("#0F172A").fontSize(7.5).font("Helvetica-Bold").text("VEHICLE RETURN DECLARATION & SECURITY DEPOSIT SETTLEMENT", left + 7, y2 + 5);

      doc.font("Helvetica").fontSize(6.5).fillColor("#334155");
      doc.text(
        `I confirm the physical return of vehicle ${str(vehicle.name)} (Plate: ${plateNo}) at ${actualReturnTime}. Total distance recorded is ${totalKmDriven !== null ? `${totalKmDriven} km` : "verified"} (Start: ${startOdo ?? "—"} km, End: ${endOdo ?? "—"} km). The vehicle condition, fuel cluster, and security deposit adjustment (${formatPdfINR(depositAmount)}) have been audited, reconciled, and finalized per company terms.`,
        left + 7,
        y2 + 16,
        { width: pageWidth - 14, lineGap: 1 }
      );

      y2 += decBoxH + 6;

      // Key Return Terms Box
      const retTermsBoxH = 46;
      doc.roundedRect(left, y2, pageWidth, retTermsBoxH, 3).lineWidth(0.5).strokeColor("#CBD5E1").fillColor("#F8FAFC").fillAndStroke();
      doc.fillColor("#0F172A").fontSize(7).font("Helvetica-Bold").text("FINAL RETURN TERMS & SETTLEMENT CLAUSES", left + 7, y2 + 4.5);

      let rty = y2 + 14;
      doc.font("Helvetica").fontSize(6).fillColor("#475569");
      const keyReturnClauses = [
        "1. Fuel Reconciliation: Vehicle fuel level verified against initial handover gauge reading.",
        "2. Damage & Condition Check: Physical inspection completed across all 4 profiles and instrument cluster.",
        "3. Traffic Violations: Customer remains liable for any challans, tolls, or fines incurred during custody.",
        "4. Security Deposit: Refundable deposit processed per handover policy and damage-free confirmation.",
      ];
      for (const rc of keyReturnClauses) {
        doc.text(rc, left + 7, rty, { width: pageWidth - 14 });
        rty += 7.5;
      }

      y2 += retTermsBoxH + 6;

      // Dual Drop-off Signatures: Handover Staff Sign + Fresh Customer Sign to be taken
      const dropSigBoxW = (pageWidth - colGap) / 2;
      const dropSigBoxH = 75;

      // Left Box: Handover Staff Sign Line (At Drop-off)
      doc.roundedRect(left, y2, dropSigBoxW, dropSigBoxH, 3).lineWidth(0.75).strokeColor("#0284C7").stroke();
      doc.rect(left, y2, dropSigBoxW, 15).fill("#E0F2FE");
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0369A1").text("HANDOVER STAFF SIGNATURE (RETURN OFFICER)", left + 7, y2 + 4);

      doc.fontSize(7).font("Helvetica").fillColor("#334155");
      doc.text(`Return Officer: ${returnStaffName} (${returnStaffRole})`, left + 7, y2 + 18);
      doc.text(`Return Date & Time: ${actualReturnTime}`, left + 7, y2 + 28);
      doc.text("I confirm receipt of vehicle, keys, and physical condition audit.", left + 7, y2 + 38, { width: dropSigBoxW - 14 });
      doc.text("Officer Signature: _________________________________", left + 7, y2 + 58);

      // Right Box: Fresh Customer Signature (To be taken at Drop-off)
      doc.roundedRect(rightCol, y2, dropSigBoxW, dropSigBoxH, 3).lineWidth(0.75).strokeColor("#0284C7").stroke();
      doc.rect(rightCol, y2, dropSigBoxW, 15).fill("#E0F2FE");
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0369A1").text("FRESH CUSTOMER SIGNATURE (TAKEN AT DROP-OFF)", rightCol + 7, y2 + 4);

      doc.fontSize(7).font("Helvetica").fillColor("#334155");
      doc.text(`Customer: ${str(customer.name)} (${str(customer.phone)})`, rightCol + 7, y2 + 18);
      doc.text(`Return Date: ${actualReturnTime}`, rightCol + 7, y2 + 28);
      doc.text("I confirm vehicle return, final odometer reading & settlement.", rightCol + 7, y2 + 38, { width: dropSigBoxW - 14 });
      doc.text("Customer Signature: _________________________________", rightCol + 7, y2 + 58);

      // Page 2 Footer
      doc.fontSize(6).font("Helvetica").fillColor("#94A3B8").text(
        `Darshh Holiday Rental Management System · Return Record: ${reportId} · Page 2 of 2 · Authoritative Drop-Off Audit`,
        left,
        y2 + dropSigBoxH + 4,
        { width: pageWidth, align: "center" }
      );
    }

    doc.end();
    });
  }

  const firstAttempt = await render(rawPhotoBytes);
  const imageCount = rawPhotoBytes.filter(Boolean).length;

  if (firstAttempt.length <= MAX_PDF_BYTES) {
    console.log(JSON.stringify({
      evt: "pdf_generated", bookingId, mode, bytes: firstAttempt.length, images: imageCount, optimized: false,
    }));
    return firstAttempt;
  }

  // Over budget: recompress the already-downloaded image bytes IN MEMORY (never the
  // Storage originals, never the evidence copy) and re-render with the identical
  // layout code above. Steps through progressively smaller/lower-quality copies —
  // every photo stays embedded at every step, only its resolution/quality drops —
  // until the render fits, or every step has been tried.
  const optimizeStart = Date.now();
  let lastAttempt = firstAttempt;
  for (const step of PDF_EMBED_SHRINK_STEPS) {
    let optimizedBytes: Array<Buffer | null>;
    try {
      optimizedBytes = await Promise.all(rawPhotoBytes.map((buf) => (buf ? shrinkForPdfEmbed(buf, step) : null)));
    } catch (err) {
      console.error(`[inspection-pdf] image optimization step ${step.width}px/q${step.quality} failed:`, err);
      continue;
    }
    lastAttempt = await render(optimizedBytes);
    if (lastAttempt.length <= MAX_PDF_BYTES) {
      const optimizeMs = Date.now() - optimizeStart;
      console.log(JSON.stringify({
        evt: "pdf_generated", bookingId, mode, bytes: lastAttempt.length, images: imageCount,
        optimized: true, step: `${step.width}px/q${step.quality}`, optimizeMs,
      }));
      return lastAttempt;
    }
  }

  console.error(JSON.stringify({
    evt: "pdf_too_large", bookingId, mode, bytes: lastAttempt.length, limit: MAX_PDF_BYTES, images: imageCount,
  }));
  throw new PdfTooLargeError(
    `The ${mode} report for booking ${b.booking_no} is ${(lastAttempt.length / 1024).toFixed(0)}KB even after image optimization, ` +
    `exceeding the ${(MAX_PDF_BYTES / 1024).toFixed(0)}KB limit. This booking may have unusually large source images — contact support.`
  );
}
