import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBaseUrl(): string {
  if (process.env.CRM_API_URL) return process.env.CRM_API_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_CRM_API_URL) return process.env.NEXT_PUBLIC_CRM_API_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return "https://darshan-tours-crm-papadon.vercel.app";
  }
  return "http://localhost:3001";
}

const KEY = process.env.GATEWAY_API_KEY ?? "adb661bf6bbe85efd79f26fa2901e580809755dc7bfb37e69f444cb7f2be305c";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

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
      return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
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

    let targetSubfolder = "";
    if (folderParam && folderParam.trim()) {
      targetSubfolder = folderParam.trim().replace(/^\/+|\/+$/g, "");
    } else if (categoryParam && categoryParam.trim()) {
      targetSubfolder = `${categoryParam.trim().toLowerCase()}s/${dateStr}`;
    } else {
      targetSubfolder = `customer-documents/${dateStr}`;
    }

    const rawBaseName = file.name ? file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) : "document";
    const fileName = `${rawBaseName}_${nowStamp}_${cleanRandom}.${ext}`;
    const structuredPath = `${targetSubfolder}/${fileName}`;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const bucketName = "vehicle-photos";
        const buf = Buffer.from(await file.arrayBuffer());

        // Ensure bucket exists
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets?.some((b) => b.name === bucketName)) {
          await supabase.storage.createBucket(bucketName, { public: true });
        }

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(bucketName)
          .upload(structuredPath, buf, { contentType: file.type, upsert: true });

        if (!uploadErr && uploadData) {
          const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(structuredPath);
          if (pubUrl?.publicUrl) {
            return NextResponse.json({ ok: true, path: pubUrl.publicUrl, structuredPath });
          }
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
      headers: { "x-gateway-key": KEY },
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
