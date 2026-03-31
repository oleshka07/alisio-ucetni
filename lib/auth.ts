import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "alisio_auth";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export type SessionRole = "accountant" | "client";

export type Session = {
  role: SessionRole;
  clientId?: string;
  token: string;
};

// ─── Token generation ──────────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSecret(): string {
  return process.env.AUTH_SECRET || "alisio-default-secret-change-me";
}

export async function createToken(role: SessionRole, clientId?: string): Promise<string> {
  const payload = `${role}:${clientId || ""}:${getSecret()}`;
  return sha256(payload);
}

export async function verifyToken(
  token: string,
  role: SessionRole,
  clientId?: string
): Promise<boolean> {
  const expected = await createToken(role, clientId);
  return token === expected;
}

// ─── Cookie helpers ────────────────────────────────────────────────────────────

export function buildSessionCookie(session: Session): string {
  const value = JSON.stringify(session);
  const encoded = Buffer.from(value).toString("base64");
  return `${COOKIE_NAME}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Parse session from raw cookie header (for middleware - no access to cookies())
export function parseSessionFromRequest(request: NextRequest): Session | null {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    return JSON.parse(decoded) as Session;
  } catch {
    return null;
  }
}

// Parse session from cookies() in server components/API routes
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as Session;
    // Verify token
    const valid = await verifyToken(session.token, session.role, session.clientId);
    if (!valid) return null;
    return session;
  } catch {
    return null;
  }
}

// ─── Access code generation ────────────────────────────────────────────────────

export function generateAccessCode(): string {
  // 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}
