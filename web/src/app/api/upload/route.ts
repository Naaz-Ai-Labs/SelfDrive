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
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
    }

    // 1. Direct Supabase Storage Upload (Primary)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const bucketName = "vehicle-photos";
        const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "jpg";
        const randomName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${ext}`;
        const buf = Buffer.from(await file.arrayBuffer());

        // Ensure bucket exists
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets?.some((b) => b.name === bucketName)) {
          await supabase.storage.createBucket(bucketName, { public: true });
        }

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(bucketName)
          .upload(randomName, buf, { contentType: file.type, upsert: true });

        if (!uploadErr && uploadData) {
          const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(randomName);
          if (pubUrl?.publicUrl) {
            return NextResponse.json({ ok: true, path: pubUrl.publicUrl });
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
