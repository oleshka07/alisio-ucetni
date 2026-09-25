import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Сесії: cookie = base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Працює і в middleware (edge), і в Node — лише Web Crypto.
 * Термін дії вбудований у payload (exp), тож вкрадений cookie не живе вічно.
 */

const COOKIE_NAME = "alisio_session";
const SESSION_DAYS = 14;

export type SessionRole = "owner" | "accountant" | "client";

export type Session = {
  role: SessionRole;
  userId?: string;
  clientId?: string;
  name?: string;
  exp: number; // unix seconds
};

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set (min 32 chars)");
  }
  return s;
}

const enc = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(getSecret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(session: Omit<Session, "exp"> & { exp?: number }): Promise<string> {
  const payload: Session = { ...session, exp: session.exp ?? Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  const body = b64urlFromBytes(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64urlFromBytes(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), bytesFromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(bytesFromB64url(body))) as Session;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!["owner", "accountant", "client"].includes(session.role)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function buildSessionCookie(session: Omit<Session, "exp">): Promise<string> {
  const token = await signSession(session);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Для middleware. */
export async function getSessionFromRequest(request: NextRequest): Promise<Session | null> {
  return verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
}

/** Для server components / route handlers. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export function isStaff(session: Session | null): session is Session & { role: "owner" | "accountant" } {
  return !!session && (session.role === "owner" || session.role === "accountant");
}

// ─── Access code (портал клієнта/співробітника) ────────────────────────────────

export function generateAccessCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return (100000 + n).toString();
}
