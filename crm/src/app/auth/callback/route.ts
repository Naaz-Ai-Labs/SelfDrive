import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { createSession, persistSession, SESSION_COOKIE } from "@/lib/auth";
import { sbSelectOne, sbInsert } from "@/lib/supabase-rest";

type UserRow = { id: number; name: string; email: string; role: string; is_active: number };

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/dashboard/login?error=Missing authorization code`);
  }

  if (!supabase) {
    return NextResponse.redirect(`${origin}/dashboard/login?error=Supabase not configured`);
  }

  try {
    // Exchange code for Supabase Session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      console.error("Supabase OAuth exchange error:", error?.message);
      return NextResponse.redirect(`${origin}/dashboard/login?error=${encodeURIComponent(error?.message || "OAuth exchange failed")}`);
    }

    const email = data.user.email;
    const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || email?.split("@")[0] || "Staff User";

    if (!email) {
      return NextResponse.redirect(`${origin}/dashboard/login?error=No email returned from provider`);
    }

    const emailClean = email.toLowerCase().trim();

    const lookup = await sbSelectOne<UserRow>(
      "users",
      `select=id,name,email,role,is_active&email=eq.${encodeURIComponent(emailClean)}`
    );
    if (!lookup.ok) {
      console.error("OAuth callback user lookup failed:", lookup.error);
      return NextResponse.redirect(`${origin}/dashboard/login?error=${encodeURIComponent("Sign-in is temporarily unavailable")}`);
    }

    let userRow = lookup.data;

    if (!userRow) {
      // Auto-provision as staff. The password hash is a deliberately unusable placeholder:
      // this account signs in through the identity provider, never with a local password.
      const dummyHash = "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789"; // OAuth account
      const created = await sbInsert<UserRow>("users", {
        name,
        email: emailClean,
        password_hash: dummyHash,
        role: "staff",
        is_active: 1,
      });
      if (!created.ok || !created.data) {
        console.error("OAuth callback provisioning failed:", created.ok ? "no row returned" : created.error);
        return NextResponse.redirect(`${origin}/dashboard/login?error=${encodeURIComponent("Could not create your account")}`);
      }
      userRow = created.data;
    }

    // `is_active` is INTEGER 1/0 per supabase/schema.sql.
    if (Number(userRow.is_active) !== 1) {
      return NextResponse.redirect(`${origin}/dashboard/login?error=Account disabled`);
    }

    // Create CRM session and set cookie
    const token = createSession(userRow.id, undefined, {
      role: userRow.role,
      email: userRow.email,
      name: userRow.name,
    });
    await persistSession(token, userRow.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (err: any) {
    console.error("OAuth callback exception:", err);
    return NextResponse.redirect(`${origin}/dashboard/login?error=${encodeURIComponent(err?.message || "Authentication failed")}`);
  }
}
