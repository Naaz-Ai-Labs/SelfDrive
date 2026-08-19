import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, assertCan } from "@/lib/auth";
import { generateInspectionPdf } from "@/lib/inspection-pdf";
import { sbSelectOne } from "@/lib/supabase-rest";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    assertCan(user, "staff");
  } catch {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { id } = await params;
  const rawRef = String(id).trim();
  if (!rawRef) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }

  const typeParam = req.nextUrl.searchParams.get("type")?.toLowerCase();
  const mode: "handover" | "return" = typeParam === "return" ? "return" : "handover";

  try {
    const pdfBuffer = await generateInspectionPdf(rawRef, mode);
    const prefix = mode === "return" ? "return-inspection" : "handover-inspection";
    const safeFilename = `${prefix}-${rawRef.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err: any) {
    console.error("[inspection-report route] generation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate inspection report PDF." },
      { status: 500 }
    );
  }
}
