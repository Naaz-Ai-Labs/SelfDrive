import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { PRIVATE_DOCS_BUCKET, isSafeStoragePath } from "@/lib/storage-buckets";

/**
 * Serves a customer identity document from the PRIVATE storage bucket.
 *
 * Customer documents (Aadhaar, driving licence, passport photos) used to be written
 * into the public `vehicle-photos` bucket and referenced by their public URL, which
 * meant anyone holding — or guessing — the link could read a customer's government ID
 * without authenticating. They now live in a private bucket and are only reachable
 * through this route, which requires a signed-in staff session.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("p");
  if (!path || !isSafeStoragePath(path)) {
    return NextResponse.json({ error: "Invalid document path." }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin.storage.from(PRIVATE_DOCS_BUCKET).download(path);
  if (error || !data) {
    console.error(`[files] could not read private document "${path}":`, error?.message);
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // Never cache a private identity document in a shared/CDN cache.
      "Cache-Control": "private, no-store",
    },
  });
}
