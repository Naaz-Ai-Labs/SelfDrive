import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { randomToken } from "@/lib/utils";
import { getWritableUploadsDir } from "@/lib/uploads-dir";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

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
