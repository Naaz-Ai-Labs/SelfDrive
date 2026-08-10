import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomToken } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-actions";
import { getWritableUploadsDir } from "@/lib/db";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

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
    return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
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

  const rawBaseName = file.name ? file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) : "image";
  const fileName = `${rawBaseName}_${nowStamp}_${cleanRandom}.${ext}`;
  const structuredPath = `${targetSubfolder}/${fileName}`;

  const baseUploadDir = getWritableUploadsDir();
  const localTargetDir = path.join(baseUploadDir, targetSubfolder);
  fs.mkdirSync(localTargetDir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(localTargetDir, fileName), buf);

  let supabasePublicUrl: string | null = null;
  const { supabaseAdmin } = await import("@/lib/supabase");

  if (supabaseAdmin) {
    try {
      const bucketName = "vehicle-photos";
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucketName)) {
        await supabaseAdmin.storage.createBucket(bucketName, { public: true });
      }

      // Upload file to Supabase Storage at structured path
      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(structuredPath, buf, { contentType: file.type, upsert: true });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabaseAdmin.storage.from(bucketName).getPublicUrl(structuredPath);
        if (pubUrl?.publicUrl) {
          supabasePublicUrl = pubUrl.publicUrl;
        }
      }
    } catch (err: any) {
      console.warn("Supabase Storage upload warning:", err?.message || err);
    }
  }

  const relativeLocalPath = `/api/files/${structuredPath}`;
  const finalPath = supabasePublicUrl ?? relativeLocalPath;

  return NextResponse.json({
    ok: true,
    path: finalPath,
    localPath: relativeLocalPath,
    structuredPath,
    supabaseUrl: supabasePublicUrl,
  });
}
