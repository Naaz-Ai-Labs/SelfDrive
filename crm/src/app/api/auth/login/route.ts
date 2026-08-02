import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

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

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE email = ? AND is_active = 1")
    .get(parsed.data.email.toLowerCase().trim()) as
    | { id: number; name: string; email: string; password_hash: string; role: string; branch: string | null }
    | undefined;

  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    const current = attempts.get(key) ?? { count: 0, blockedUntil: 0 };
    current.count += 1;
    if (current.count >= 5) current.blockedUntil = Date.now() + 10 * 60 * 1000;
    attempts.set(key, current);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  attempts.delete(key);
  const token = createSession(user.id, ip);
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  logActivity(user.id, "login", "user", user.id);

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
