import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionFromRequest, verifyToken } from "@/lib/auth";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/auth"];
const STATIC_PREFIXES = ["/_next", "/favicon.ico", "/icons", "/images"];

// API routes that clients are allowed to access 
const CLIENT_ALLOWED_API = [
  "/api/documents/upload",
  "/api/tasks/",        // PATCH own tasks
  "/api/clients/",      // PUT own profile
  "/api/portal",        // portal-specific routes
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and public paths
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Parse session
  const session = parseSessionFromRequest(request);

  if (!session) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify token
  const valid = await verifyToken(session.token, session.role, session.clientId);
  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ─── Role-based routing ────────────────────────────────────────────────

  if (session.role === "accountant") {
    if (pathname.startsWith("/portal")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const response = NextResponse.next();
    response.headers.set("x-user-role", "accountant");
    return response;
  }

  if (session.role === "client") {
    // Client can access /portal/* pages
    if (pathname.startsWith("/portal")) {
      const response = NextResponse.next();
      response.headers.set("x-user-role", "client");
      response.headers.set("x-client-id", session.clientId || "");
      return response;
    }
    // Client can access specific API routes (validation happens in API handlers)
    if (pathname.startsWith("/api/") && CLIENT_ALLOWED_API.some((p) => pathname.startsWith(p))) {
      const response = NextResponse.next();
      response.headers.set("x-user-role", "client");
      response.headers.set("x-client-id", session.clientId || "");
      return response;
    }
    // Redirect root to portal
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/portal", request.url));
    }
    // Block everything else
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/portal", request.url));
    }
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
