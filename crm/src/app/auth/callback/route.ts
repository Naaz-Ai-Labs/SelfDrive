import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { getDb } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

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

    const db = getDb();

    // Check if user exists in CRM database
    let userRow = db
      .prepare("SELECT id, name, email, role, is_active FROM users WHERE email = ?")
      .get(email) as { id: number; name: string; email: string; role: string; is_active: number } | undefined;

    if (!userRow) {
      // Auto-provision user record as staff
      const dummyHash = "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789"; // OAuth account
      const res = db
        .prepare("INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, 'staff', 1)")
        .run(name, email, dummyHash);
      const userId = Number(res.lastInsertRowid);
      userRow = { id: userId, name, email, role: "staff", is_active: 1 };
    }

    if (!userRow.is_active) {
      return NextResponse.redirect(`${origin}/dashboard/login?error=Account disabled`);
    }

    // Create CRM session and set cookie
    const token = createSession(userRow.id);
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
