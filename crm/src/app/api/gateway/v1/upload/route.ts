import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireGatewayKey } from "@/lib/gateway-auth";
import { randomToken } from "@/lib/utils";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
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
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const name = `${randomToken(16)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  // Stored as a CRM-origin-relative path: customer_documents.file_path ends up holding this
  // value verbatim, and the staff dashboard (same origin as this route) resolves it directly.
  return NextResponse.json({ ok: true, path: `/api/files/${name}` });
}
