import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getPortalSession } from "@/lib/portal-actions";
import { getWritableUploadsDir } from "@/lib/uploads-dir";

const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const staff = await getCurrentUser();
  const portal = staff ? null : await getPortalSession();
  if (!staff && !portal) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  // Prevent directory traversal
  const relativePath = pathSegments.join("/");
  if (relativePath.includes("..")) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  const uploadDir = getWritableUploadsDir();
  const fullFilePath = path.join(uploadDir, ...pathSegments);

  if (!fullFilePath.startsWith(uploadDir) || !fs.existsSync(fullFilePath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  const buf = fs.readFileSync(fullFilePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
