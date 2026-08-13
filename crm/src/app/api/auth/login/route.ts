import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword, hashPassword, createSession, persistSession, SESSION_COOKIE } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { supabaseAdmin, supabase } from "@/lib/supabase";
import { sbSelectOne, sbUpdate, sbUpsert } from "@/lib/supabase-rest";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const attempts = new Map<string, { count: number; blockedUntil: number }>();

type UserRecord = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  branch: string | null;
};

function ipOf(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const ip = ipOf(req);
  const key = `${ip}:${req.headers.get("user-agent") ?? ""}`.slice(0, 120);
  const attempt = attempts.get(key);
  if (attempt && attempt.blockedUntil > Date.now()) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const emailClean = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  // Supabase is the single source of truth. `is_active` is INTEGER (1/0) per supabase/schema.sql.
  const lookup = await sbSelectOne<UserRecord>(
    "users",
    `select=id,name,email,password_hash,role,branch&email=eq.${encodeURIComponent(emailClean)}&is_active=eq.1`
  );

  if (!lookup.ok) {
    // Never fail open: an unreachable database must not become "anyone may log in".
    console.error("[auth] login lookup failed:", lookup.error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503 });
  }

  let user: UserRecord | null = lookup.data;
  let isValid = false;

  // The bcrypt hash is the ONLY accepted proof of identity.
  //
  // Removed here: a fallback that accepted any of a hardcoded list of common
  // passwords ("admin", "admin123", "Admin@123", "staff", …) for ANY existing
  // user, and then overwrote that user's real password hash with the guessed
  // value. Anyone who knew a staff email could sign in as them — including the
  // administrator — and would silently take ownership of the account.
  if (user && verifyPassword(password, user.password_hash)) {
    isValid = true;
  }

  // Supabase Auth (the identity provider) as a second credential source, for accounts
  // created through Auth rather than through the CRM's own users table.
  const sbClient = supabaseAdmin || supabase;
  if (!isValid && sbClient) {
    try {
      const { data: authData, error: authError } = await sbClient.auth.signInWithPassword({
        email: emailClean,
        password,
      });

      if (!authError && authData?.user) {
        isValid = true;
        const meta = authData.user.user_metadata || {};
        const appMeta = (authData.user.app_metadata || {}) as { role?: string; branch?: string | null };
        const userName = meta.name || meta.full_name || emailClean.split("@")[0];
        // Role must NOT come from user_metadata: that field is writable by the user
        // themselves through the Supabase client, so anyone with an Auth account could
        // set role:"admin" and escalate on first login. app_metadata is server-only.
        // Anything not explicitly granted there starts as "staff"; an admin promotes
        // from the staff screen.
        const userRole = appMeta.role || "staff";
        const userBranch = appMeta.branch ?? null;
        const passwordHash = hashPassword(password);

        if (user) {
          await sbUpdate("users", `id=eq.${user.id}`, { password_hash: passwordHash, is_active: 1 });
          user.password_hash = passwordHash;
        } else {
          const created = await sbUpsert<UserRecord>(
            "users",
            {
              name: userName,
              email: emailClean,
              password_hash: passwordHash,
              role: userRole,
              branch: userBranch,
              is_active: 1,
            },
            "email"
          );
          if (created.ok && created.data) {
            user = created.data;
          } else {
            console.error("[auth] could not provision Auth user in users table:", created.ok ? "no row" : created.error);
            isValid = false;
          }
        }
      }
    } catch (err: any) {
      console.warn("Supabase login fallback check note:", err?.message || err);
    }
  }

  // Removed here: auto-provisioning. Any unknown email with a 3+ character password
  // created a working staff account, and an address merely CONTAINING "admin"
  // (e.g. "notadmin@anywhere.com") was granted the admin role. Combined with the
  // common-password fallback above, the CRM could be taken over by anyone who
  // could reach the login page.
  //
  // Staff accounts are now created deliberately, by an existing admin, through the
  // staff management screen.

  if (!isValid || !user) {
    const current = attempts.get(key) ?? { count: 0, blockedUntil: 0 };
    current.count += 1;
    if (current.count >= 5) current.blockedUntil = Date.now() + 10 * 60 * 1000;
    attempts.set(key, current);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  attempts.delete(key);
  const token = createSession(user.id, ip, { role: user.role, email: user.email, name: user.name });
  await persistSession(token, user.id, ip);

  const touched = await sbUpdate("users", `id=eq.${user.id}`, { last_login: new Date().toISOString() });
  if (!touched.ok) console.error("[auth] could not record last_login:", touched.error);
  try {
    await logActivity(user.id, "login", "user", user.id);
  } catch {}

  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: 7 * 24 * 3600,
  };

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
