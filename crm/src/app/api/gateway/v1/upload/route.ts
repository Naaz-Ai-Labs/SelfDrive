import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { randomToken } from "@/lib/utils";
import { getWritableUploadsDir } from "@/lib/uploads-dir";
import { PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET } from "@/lib/storage-buckets";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

/** This route's only caller is web's own /api/upload, falling back here when its
 * direct Supabase upload attempt throws. Its sole real use is customer document
 * uploads during booking, which web's primary path calls with NO folder/category at
 * all — and treats that as "private" (see isPublicMedia there). This route used to
 * hardcode the public vehicle-photos bucket unconditionally, so a document reaching
 * this fallback got a public URL exactly like a marketing photo would. Mirror web's
 * own default exactly: explicit folder/category means public media, absence means a
 * private customer document. */
function isPublicMedia(folderParam?: string, categoryParam?: string): boolean {
  return Boolean((folderParam && folderParam.trim()) || (categoryParam && categoryParam.trim()));
}

/** Upload target the web app proxies to — the browser never talks to this origin
 * directly. Trust comes from the gateway key (this request only ever originates from
 * web's own server), matching the auth model the old same-app /api/upload used to
 * enforce with a staff/portal session check. */
export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderParam = (form?.get("folder") as string | null) || undefined;
  const categoryParam = (form?.get("category") as string | null) || undefined;

  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });

  const dateStr = new Date().toISOString().slice(0, 7);
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "jpg";
  const cleanRandom = randomToken(12);
  const nowStamp = Date.now();

  const isPublic = isPublicMedia(folderParam, categoryParam);

  let targetSubfolder = "";
  if (folderParam && folderParam.trim()) {
    targetSubfolder = folderParam.trim().replace(/^\/+|\/+$/g, "");
  } else if (categoryParam && categoryParam.trim()) {
    targetSubfolder = `${categoryParam.trim().toLowerCase()}s/${dateStr}`;
  } else {
    targetSubfolder = isPublic ? `uploads/${dateStr}` : `docs/${dateStr}`;
  }
  const bucketName = isPublic ? PUBLIC_MEDIA_BUCKET : PRIVATE_DOCS_BUCKET;

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
        await supabaseAdmin.storage.createBucket(bucketName, { public: isPublic });
      }

      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(structuredPath, buf, { contentType: file.type, upsert: true });

      if (!uploadErr && uploadData) {
        if (isPublic) {
          const { data: pubUrl } = supabaseAdmin.storage.from(bucketName).getPublicUrl(structuredPath);
          if (pubUrl?.publicUrl) {
            supabasePublicUrl = pubUrl.publicUrl;
          }
        } else {
          uploadedToPrivateBucket = true;
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
