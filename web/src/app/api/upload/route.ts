import { NextRequest, NextResponse } from "next/server";

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

/** Proxies the browser's file upload (driving licence / ID photos during the booking
 * wizard, before any customer login exists) straight through to the CRM gateway, which
 * owns the actual storage. The browser only ever talks to this origin. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });

  const proxied = new FormData();
  proxied.append("file", file, file.name);

  const crmUrl = getBaseUrl();
  try {
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
    console.error("Proxy upload connection error:", err);
    return NextResponse.json({ error: "Failed to connect to backend server." }, { status: 502 });
  }
}
