import { NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Вимагає вхід співробітника (owner / accountant). Опціонально — лише певні ролі. */
export async function requireStaff(roles: Array<"owner" | "accountant"> = ["owner", "accountant"]): Promise<Session> {
  const session = await getSession();
  if (!session || session.role === "client") throw new HttpError(401, "Unauthorized");
  if (!roles.includes(session.role)) throw new HttpError(403, "Forbidden");
  return session;
}

/** Для cron-ендпоінтів: Authorization: Bearer CRON_SECRET (так шле Vercel Cron) або ?key=. */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), secret)) return true;
  const key = new URL(req.url).searchParams.get("key");
  return !!key && safeEqual(key, secret);
}

/** Обгортка для route handlers: HttpError → JSON з кодом. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      const message = err instanceof Error ? err.message : "Server error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
