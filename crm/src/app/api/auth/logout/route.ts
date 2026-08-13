import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, destroySession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  // `destroySession` unwraps the composed cookie to the opaque `sessions.token` key —
  // the old code deleted on the whole cookie value and so never matched a row.
  if (token) await destroySession(token);


  const loginUrl = new URL("/dashboard/login", req.url);
  const res = NextResponse.redirect(loginUrl, { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
