import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-actions";
import { getWritableUploadsDir } from "@/lib/uploads-dir";

const MIME: Record<string, string> = {
  jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
};

// Uploaded files (licence scans, ID proofs, inspection photos) can contain personal or
// government ID data, so this route is never publicly listable and always requires an
// active staff or customer session before streaming a file back.
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const staff = await getCurrentUser();
  const portal = staff ? null : await getPortalSession();
  if (!staff && !portal) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { name } = await params;
  if (!/^[a-f0-9]{16,64}\.[a-z]{3,4}$/i.test(name)) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }
  const uploadDir = getWritableUploadsDir();
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, name);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const ext = name.split(".").pop() ?? "";
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
}
