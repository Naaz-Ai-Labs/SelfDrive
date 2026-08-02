import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.CRM_API_URL ?? "http://localhost:3001";
const KEY = process.env.GATEWAY_API_KEY ?? "";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

/** Proxies the browser's file upload (driving licence / ID photos during the booking
 * wizard, before any customer login exists) straight through to the CRM gateway, which
 * owns the actual disk storage. The browser only ever talks to this origin. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });

  const proxied = new FormData();
  proxied.append("file", file, file.name);
  const res = await fetch(`${BASE}/api/gateway/v1/upload`, {
    method: "POST",
    headers: { "x-gateway-key": KEY },
    body: proxied,
  });
  const data = await res.json().catch(() => ({ error: "Upload failed." }));
  return NextResponse.json(data, { status: res.status });
}
