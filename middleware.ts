import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

// Без сесії. Cron і Telegram мають власні секрети, які перевіряються в самих хендлерах.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/cron", "/api/telegram/webhook"];
const STATIC_PREFIXES = ["/_next", "/favicon.ico", "/icons", "/images"];

// API, доступні клієнтському порталу (6-значний код)
const CLIENT_ALLOWED_API = ["/api/documents/upload", "/api/tasks/", "/api/clients/", "/api/portal"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await getSessionFromRequest(request);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.role === "owner" || session.role === "accountant") {
    if (pathname.startsWith("/portal") || pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // role === "client"
  if (pathname.startsWith("/portal")) return NextResponse.next();
  if (pathname.startsWith("/api/") && CLIENT_ALLOWED_API.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/documents/") && pathname.endsWith("/file")) {
    return NextResponse.next(); // перевірка власника — у хендлері
  }
  if (!pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
