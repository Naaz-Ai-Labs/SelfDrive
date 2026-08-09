import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword, hashPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { supabaseAdmin, supabase } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const attempts = new Map<string, { count: number; blockedUntil: number }>();

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

  const db = getDb();
  let user = db
    .prepare("SELECT * FROM users WHERE email = ? AND is_active = 1")
    .get(emailClean) as
    | { id: number; name: string; email: string; password_hash: string; role: string; branch: string | null }
    | undefined;

  let isValid = false;

  if (user && verifyPassword(password, user.password_hash)) {
    isValid = true;
  }

  // If local SQLite check fails or user is missing in SQLite, verify with Supabase Auth or Supabase DB
  const sbClient = supabaseAdmin || supabase;
  if (!isValid && sbClient) {
    try {
      // 1. Attempt Supabase Auth login with provided credentials
      const { data: authData, error: authError } = await sbClient.auth.signInWithPassword({
        email: emailClean,
        password,
      });

      if (!authError && authData?.user) {
        isValid = true;
        const meta = authData.user.user_metadata || {};
        const userName = meta.name || meta.full_name || emailClean.split("@")[0];
        const userRole = meta.role || "staff";
        const userBranch = meta.branch || null;
        const passwordHash = hashPassword(password);

        if (user) {
          db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?").run(passwordHash, user.id);
          user.password_hash = passwordHash;
        } else {
          const res = db
            .prepare("INSERT INTO users (name, email, password_hash, role, branch, is_active) VALUES (?, ?, ?, ?, ?, 1)")
            .run(userName, emailClean, passwordHash, userRole, userBranch);
          const newId = Number(res.lastInsertRowid);
          user = { id: newId, name: userName, email: emailClean, password_hash: passwordHash, role: userRole, branch: userBranch };
        }
      } else if (supabaseAdmin) {
        // 2. Also check if user exists in Supabase DB 'users' table with matching password hash
        const { data: sbDbUser } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("email", emailClean)
          .eq("is_active", 1)
          .maybeSingle();

        if (sbDbUser && sbDbUser.password_hash && verifyPassword(password, sbDbUser.password_hash)) {
          isValid = true;
          const passwordHash = sbDbUser.password_hash;
          if (user) {
            db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?").run(passwordHash, user.id);
            user.password_hash = passwordHash;
          } else {
            const res = db
              .prepare("INSERT INTO users (name, email, password_hash, role, branch, is_active) VALUES (?, ?, ?, ?, ?, 1)")
              .run(sbDbUser.name || emailClean.split("@")[0], emailClean, passwordHash, sbDbUser.role || "staff", sbDbUser.branch || null);
            const newId = Number(res.lastInsertRowid);
            user = { id: newId, name: sbDbUser.name, email: emailClean, password_hash: passwordHash, role: sbDbUser.role, branch: sbDbUser.branch };
          }
        }
      }
    } catch (err: any) {
      console.warn("Supabase login fallback check note:", err?.message || err);
    }
  }

  if (!isValid || !user) {
    const current = attempts.get(key) ?? { count: 0, blockedUntil: 0 };
    current.count += 1;
    if (current.count >= 5) current.blockedUntil = Date.now() + 10 * 60 * 1000;
    attempts.set(key, current);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  attempts.delete(key);
  const token = createSession(user.id, ip, { role: user.role, email: user.email, name: user.name });
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  logActivity(user.id, "login", "user", user.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
