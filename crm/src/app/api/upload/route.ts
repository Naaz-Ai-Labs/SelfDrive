import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomToken } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-actions";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
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
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const name = `${randomToken(16)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  return NextResponse.json({ ok: true, path: `/api/files/${name}` });
}
