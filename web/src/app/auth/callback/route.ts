import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { CUSTOMER_COOKIE } from "@/lib/gateway";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/customer?error=Missing authorization code`);
  }

  if (!supabase) {
    return NextResponse.redirect(`${origin}/customer?error=Supabase not configured`);
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error("Web OAuth exchange error:", error?.message);
      return NextResponse.redirect(`${origin}/customer?error=${encodeURIComponent(error?.message || "OAuth exchange failed")}`);
    }

    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_COOKIE, data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });

    return NextResponse.redirect(`${origin}/customer`);
  } catch (err: any) {
    console.error("Web OAuth callback exception:", err);
    return NextResponse.redirect(`${origin}/customer?error=${encodeURIComponent(err?.message || "Authentication failed")}`);
  }
}
