import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomToken } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-actions";
import { getWritableUploadsDir } from "@/lib/uploads-dir";
import { PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET } from "@/lib/storage-buckets";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
/**
 * 4 MB, not 8 MB — this route runs as a Vercel Node serverless function, and the
 * platform caps a function's REQUEST BODY at 4.5 MB. Anything above that was rejected
 * by Vercel's edge with a bare 413 before this handler ever ran, so the app's own
 * "max 8MB" message was unreachable and the user saw an opaque platform error instead.
 * 4 MB leaves headroom for the multipart envelope around the file itself.
 *
 * This is not a practical restriction on real uploads: every image path compresses
 * client-side first (compressImageFile, 1600px/JPEG — measured average 201 KB across
 * 227 production inspection photos, largest 520 KB), and the largest PDF in production
 * storage is 1.3 MB. Raising the ceiling requires moving off a request-body-proxied
 * upload entirely (direct-to-Storage), not a bigger number here.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/** Folders that carry customer identity/agreement data and must never be public,
 * regardless of the request's own folder string. SignedDocumentUploader posts here
 * with folder="signed_agreements" (a scanned, signed rental agreement — name,
 * signature, ID details) and this route used to upload it straight into the public
 * vehicle-photos bucket alongside marketing photos, with a public URL handed back
 * and rendered as a direct link in the CRM UI. */
const PRIVATE_FOLDER_PREFIXES = ["signed_agreements", "documents", "licence", "aadhaar", "govt_id", "id_proof"];

function isPrivateFolder(folder: string): boolean {
  const lower = folder.toLowerCase();
  return PRIVATE_FOLDER_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}/`) || lower.startsWith(`${p}s/`));
}

export async function POST(req: NextRequest) {
  // Uploads happen either from an authenticated staff/employee session (inspection photos,
  // damage evidence) or an authenticated/otherwise-in-progress customer flow (licence, ID,
  // address proof during booking). We require at least one of the two — anonymous upload is
  // never allowed, since these files can contain government ID data.
  const staff = await getCurrentUser();
  const portal = staff ? null : await getPortalSession();
  if (!staff && !portal) {
    return NextResponse.json({ error: "Please log in to upload files." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderParam = (form?.get("folder") as string | null) || undefined;
  const categoryParam = (form?.get("category") as string | null) || undefined;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 4MB)." }, { status: 400 });
  }

  // Generate structured path: e.g. "inspections/2026-08/front_1723289000_abc123.jpg" or "documents/12/licence_1723289000.jpg"
  const dateStr = new Date().toISOString().slice(0, 7);
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "jpg";
  const cleanRandom = randomToken(12);
  const nowStamp = Date.now();

  let targetSubfolder = "";
  if (folderParam && folderParam.trim()) {
    targetSubfolder = folderParam.trim().replace(/^\/+|\/+$/g, "");
  } else if (categoryParam && categoryParam.trim()) {
    targetSubfolder = `${categoryParam.trim().toLowerCase()}s/${dateStr}`;
  } else {
    targetSubfolder = `uploads/${dateStr}`;
  }

  const isPrivate = isPrivateFolder(targetSubfolder) || (categoryParam ? isPrivateFolder(categoryParam) : false);
  const bucketName = isPrivate ? PRIVATE_DOCS_BUCKET : PUBLIC_MEDIA_BUCKET;

  const rawBaseName = file.name ? file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) : "image";
  const fileName = `${rawBaseName}_${nowStamp}_${cleanRandom}.${ext}`;
  const structuredPath = `${targetSubfolder}/${fileName}`;

  const baseUploadDir = getWritableUploadsDir();
  const localTargetDir = path.join(baseUploadDir, targetSubfolder);
  fs.mkdirSync(localTargetDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(localTargetDir, fileName), buf);

  let supabasePublicUrl: string | null = null;
  let uploadedToPrivateBucket = false;
  const { supabaseAdmin } = await import("@/lib/supabase");

  if (supabaseAdmin) {
    try {
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucketName)) {
        await supabaseAdmin.storage.createBucket(bucketName, { public: !isPrivate });
      }

      // Upload file to Supabase Storage at structured path
      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(structuredPath, buf, { contentType: file.type, upsert: true });

      if (!uploadErr && uploadData) {
        if (isPrivate) {
          // A customer document/signed agreement must never get a direct public URL —
          // it is served only through /api/files/doc, which checks for a staff session
          // before streaming it out of the private bucket.
          uploadedToPrivateBucket = true;
        } else {
          const { data: pubUrl } = supabaseAdmin.storage.from(bucketName).getPublicUrl(structuredPath);
          if (pubUrl?.publicUrl) {
            supabasePublicUrl = pubUrl.publicUrl;
          }
        }
      }
    } catch (err: any) {
      console.warn("Supabase Storage upload warning:", err?.message || err);
    }
  }

  const relativeLocalPath = `/api/files/${structuredPath}`;
  const privateDocPath = `/api/files/doc?p=${encodeURIComponent(structuredPath)}`;
  const finalPath = uploadedToPrivateBucket ? privateDocPath : (supabasePublicUrl ?? relativeLocalPath);

  return NextResponse.json({
    ok: true,
    path: finalPath,
    localPath: relativeLocalPath,
    structuredPath,
    supabaseUrl: supabasePublicUrl,
  });
}
