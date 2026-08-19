import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { cacheInvalidatePrefix } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const secret = process.env.GATEWAY_API_KEY;
  const providedKey =
    req.headers.get("x-gateway-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!secret || !providedKey || providedKey !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    await cacheInvalidatePrefix("web:gateway:").catch(() => {});

    const body = await req.json().catch(() => ({}));
    const paths: string[] = Array.isArray(body?.paths) && body.paths.length > 0
      ? body.paths
      : ["/", "/vehicles", "/booking"];

    for (const p of paths) {
      if (typeof p === "string" && p.startsWith("/")) {
        revalidatePath(p, "page");
      }
    }

    // Comprehensive cache purge for fleet and vehicle detail pages
    revalidatePath("/", "layout");
    revalidatePath("/vehicles", "page");
    revalidatePath("/vehicles/[slug]", "page");
    revalidatePath("/booking", "page");

    return NextResponse.json({
      ok: true,
      revalidated: true,
      paths,
      now: Date.now(),
    });
  } catch (err: any) {
    console.error("[revalidate] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to revalidate." },
      { status: 500 }
    );
  }
}
