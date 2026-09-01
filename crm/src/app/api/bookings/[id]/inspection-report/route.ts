import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, assertCan } from "@/lib/auth";
import { generateInspectionPdf, resolveBookingId, PdfTooLargeError } from "@/lib/inspection-pdf";
import { sbSelectOne, sbUpsert } from "@/lib/supabase-rest";
import { supabaseAdmin } from "@/lib/supabase";
import { PRIVATE_DOCS_BUCKET } from "@/lib/storage-buckets";

type StoredDoc = { id: number; path: string; size: number };

// Uncached generation (first view of a report) does 6+ DB queries, up to 13 Storage
// downloads, and a full pdfkit render — measured ~4.2s, but that was on an otherwise
// idle instance. On a busy day several bookings can hit their FIRST view at once
// (a batch of handovers around the same time), each paying that cost concurrently;
// without this, Vercel's default function timeout (10s on Hobby) could cut a slow
// one off mid-render under that contention. 30s matches the webhook route's own
// maxDuration for the same reason — real work, not a runaway request.
export const maxDuration = 30;

/**
 * Once a booking's handover/return inspection is recorded, its source data never
 * changes (photos aren't editable, geo/odometer are stamped once) — so the report is
 * generated once and reused for every future view, instead of the previous ~4.2s
 * rebuild (6+ DB queries, up to 13 Storage downloads, a full pdfkit render) on EVERY
 * click. See supabase/migrations/20260901j_generated_pdf_artifacts.sql for the storage
 * design (the existing, previously-unused `documents` table).
 *
 * Concurrency: if two staff open the same never-yet-generated report at the same
 * moment, both may render (bounded — happens at most once per booking, and both
 * renders are correct/deterministic) — the unique constraint on the upsert below
 * guarantees only one `documents` row survives, so a later view never has to choose
 * between duplicates.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    assertCan(user, "staff");
  } catch {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { id } = await params;
  const rawRef = String(id).trim();
  if (!rawRef) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }

  const typeParam = req.nextUrl.searchParams.get("type")?.toLowerCase();
  const mode: "handover" | "return" = typeParam === "return" ? "return" : "handover";
  const prefix = mode === "return" ? "return-inspection" : "handover-inspection";

  const bookingId = await resolveBookingId(rawRef);
  if (!bookingId) {
    return NextResponse.json({ error: `Booking ${rawRef} not found.` }, { status: 404 });
  }
  const kind = `${mode}_report_pdf`;
  const safeFilename = `${prefix}-${rawRef.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

  // 1. Serve the stored artifact if one already exists — this is the ONLY query on
  // every view after the first, replacing the entire generate pipeline.
  if (supabaseAdmin) {
    const existing = await sbSelectOne<StoredDoc>(
      "documents",
      `select=id,path,size&entity_type=eq.booking&entity_id=eq.${bookingId}&kind=eq.${kind}`
    );
    if (existing.ok && existing.data) {
      const { data, error } = await supabaseAdmin.storage.from(PRIVATE_DOCS_BUCKET).download(existing.data.path);
      if (!error && data) {
        console.log(JSON.stringify({ evt: "pdf_served_cached", bookingId, mode, bytes: existing.data.size }));
        return new NextResponse(await data.arrayBuffer(), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${safeFilename}"`,
            // Immutable once generated: the source inspection data this report reads
            // (photos, odometer, geo) is never edited after handover/return is
            // recorded. Still private/auth-gated — this only permits the BROWSER
            // that already authenticated to this route to keep its own copy, never a
            // shared/CDN cache.
            "Cache-Control": "private, max-age=31536000, immutable",
          },
        });
      }
      // Row exists but the Storage object doesn't (e.g. manually deleted) — fall
      // through and regenerate rather than erroring the whole request.
      console.error(`[inspection-report] stored artifact ${existing.data.path} missing from Storage, regenerating`);
    }
  }

  // 2. No stored artifact (or it went missing) — generate, store, then serve.
  try {
    const pdfBuffer = await generateInspectionPdf(rawRef, mode);

    if (supabaseAdmin) {
      const storagePath = `signed-documents/${mode}/${bookingId}.pdf`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(PRIVATE_DOCS_BUCKET)
        .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

      if (uploadErr) {
        console.error(`[inspection-report] Storage upload failed for booking ${bookingId}:`, uploadErr.message);
        // Still serve the freshly generated PDF to the requesting staff member — a
        // failed cache write must not block the document they actually asked for.
      } else {
        const saved = await sbUpsert(
          "documents",
          {
            entity_type: "booking",
            entity_id: bookingId,
            kind,
            name: safeFilename,
            path: storagePath,
            size: pdfBuffer.length,
            uploaded_by: user.id,
          },
          "entity_type,entity_id,kind"
        );
        if (!saved.ok) {
          console.error(`[inspection-report] documents row not saved for booking ${bookingId}:`, saved.error);
        }
      }
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    if (err instanceof PdfTooLargeError) {
      console.error(`[inspection-report] booking ${bookingId} PDF exceeded the size limit:`, err.message);
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[inspection-report route] generation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate inspection report PDF." },
      { status: 500 }
    );
  }
}
