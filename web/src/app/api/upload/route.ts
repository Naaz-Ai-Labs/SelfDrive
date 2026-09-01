import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, getGatewayKey } from "@/lib/gateway";
import { PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET, sanitizeFolder } from "@/lib/storage-buckets";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
/** 4 MB, matching crm/src/app/api/upload/route.ts — Vercel caps a Node serverless
 * function's request body at 4.5 MB, so an 8 MB app limit was unreachable and produced
 * an opaque platform 413 instead of this route's own error. See that file for detail. */
const MAX_BYTES = 4 * 1024 * 1024;

/** High-availability direct Supabase Storage upload with secondary CRM gateway fallback.
 * Guarantees zero 502 Bad Gateway proxy errors on production Vercel deployments. */
export async function POST(req: NextRequest) {
  try {
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

    // 1. Direct Supabase Storage Upload with Structured Path
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const dateStr = new Date().toISOString().slice(0, 7);
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "jpg";
    const cleanRandom = Math.random().toString(36).substring(2, 12);
    const nowStamp = Date.now();

    // A caller-supplied folder is untrusted: it used to be trimmed of slashes only,
    // so "../" segments passed straight through into the storage key.
    const safeFolder = sanitizeFolder(folderParam);
    if (folderParam && !safeFolder) {
      return NextResponse.json({ error: "Invalid upload folder." }, { status: 400 });
    }
    const safeCategory = categoryParam ? sanitizeFolder(categoryParam.toLowerCase()) : null;

    // Anything that is not explicitly public media is treated as a customer identity
    // document and goes to the PRIVATE bucket.
    const isPublicMedia = Boolean(safeFolder || safeCategory);
    const targetSubfolder = safeFolder ?? (safeCategory ? `${safeCategory}s/${dateStr}` : `docs/${dateStr}`);
    const bucketName = isPublicMedia ? PUBLIC_MEDIA_BUCKET : PRIVATE_DOCS_BUCKET;

    const rawBaseName = file.name ? file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) : "document";
    const fileName = `${rawBaseName}_${nowStamp}_${cleanRandom}.${ext}`;
    const structuredPath = `${targetSubfolder}/${fileName}`;

    if (supabaseUrl && supabaseKey) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const cleanUrl = supabaseUrl.replace(/\/$/, "");

        const uploadRes = await fetch(`${cleanUrl}/storage/v1/object/${bucketName}/${structuredPath}`, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "x-upsert": "true",
          },
          body: buf,
        });

        if (uploadRes.ok) {
          // Public media keeps its direct public URL. A customer document must NOT get
          // one — it is returned as a CRM route that checks for a staff session before
          // streaming the file out of the private bucket.
          const path = isPublicMedia
            ? `${cleanUrl}/storage/v1/object/public/${bucketName}/${structuredPath}`
            : `/api/files/doc?p=${encodeURIComponent(structuredPath)}`;
          return NextResponse.json({ ok: true, path, structuredPath });
        }
      } catch (supaErr) {
        console.warn("Direct Supabase Storage upload fallback attempt:", supaErr);
      }
    }

    // 2. Secondary CRM Gateway Upload Proxy
    const crmUrl = getBaseUrl();
    const proxied = new FormData();
    proxied.append("file", file, file.name);
    if (folderParam) proxied.append("folder", folderParam);
    if (categoryParam) proxied.append("category", categoryParam);

    const res = await fetch(`${crmUrl}/api/gateway/v1/upload`, {
      method: "POST",
      headers: { "x-gateway-key": getGatewayKey() },
      body: proxied,
    });
    const data = await res.json().catch(() => ({ error: "Upload failed." }));
    if (res.ok && data.path) {
      const fullPath = data.path.startsWith("/") ? `${crmUrl}${data.path}` : data.path;
      return NextResponse.json({ ...data, path: fullPath, ok: true });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("Upload route connection error:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
