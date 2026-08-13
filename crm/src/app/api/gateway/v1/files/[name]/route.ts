import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireGatewayKey, bearerCustomer } from "@/lib/gateway-auth";
import { getDb, getWritableUploadsDir } from "@/lib/db";

const MIME: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const customer = await bearerCustomer(req);
  if (!customer) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const { name } = await params;
  if (!/^[a-f0-9]{16,64}\.[a-z]{3,4}$/i.test(name)) return NextResponse.json({ error: "Invalid file name." }, { status: 400 });

  const owns = getDb()
    .prepare("SELECT 1 FROM customer_documents WHERE customer_id = ? AND file_path = ?")
    .get(customer.customerId, `/api/files/${name}`);
  if (!owns) return NextResponse.json({ error: "Not authorised." }, { status: 403 });

  const uploadDir = getWritableUploadsDir();
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, name);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ext = name.split(".").pop() ?? "";
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
}
