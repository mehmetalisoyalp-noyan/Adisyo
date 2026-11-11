import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

// /api/cron: Vercel zamanlanmış görevi; kendi gizli anahtarıyla korunur (oturum çerezi yok)
export const config = { matcher: ["/((?!login|_next|favicon.ico|api/cron).*)"] };
