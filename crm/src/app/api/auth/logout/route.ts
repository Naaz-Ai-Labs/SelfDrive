import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    } catch {}
  }
  
  const loginUrl = new URL("/dashboard/login", req.url);
  const res = NextResponse.redirect(loginUrl, { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
