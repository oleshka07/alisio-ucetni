import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/auth";

// Проста пам'ять спроб на інстанс: 10 невдалих спроб / 15 хв з одного IP.
const attempts = new Map<string, { count: number; until: number }>();

function tooMany(ip: string): boolean {
  const a = attempts.get(ip);
  return !!a && a.count >= 10 && a.until > Date.now();
}
function fail(ip: string) {
  const a = attempts.get(ip);
  if (!a || a.until < Date.now()) attempts.set(ip, { count: 1, until: Date.now() + 15 * 60_000 });
  else a.count++;
}

/**
 * Перший вхід: якщо користувачів ще немає і email/пароль збігаються з
 * BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_OWNER_PASSWORD — створюємо власника.
 */
async function bootstrapOwner(email: string, password: string) {
  const bEmail = process.env.BOOTSTRAP_OWNER_EMAIL?.toLowerCase();
  const bPass = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (!bEmail || !bPass || email !== bEmail || password !== bPass) return null;
  if ((await prisma.user.count()) > 0) return null;
  return prisma.user.create({
    data: { email, name: "Oleg", role: "owner", passwordHash: await bcrypt.hash(password, 10) },
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (tooMany(ip)) {
    return NextResponse.json({ error: "Příliš mnoho pokusů, zkuste to za 15 minut" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { mode } = body;

    if (mode === "user") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) {
        return NextResponse.json({ error: "Zadejte e-mail a heslo" }, { status: 400 });
      }

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) user = await bootstrapOwner(email, password);

      if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
        fail(ip);
        return NextResponse.json({ error: "Nesprávný e-mail nebo heslo" }, { status: 401 });
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const role = user.role === "owner" ? "owner" : "accountant";
      const response = NextResponse.json({ success: true, role });
      response.headers.set("Set-Cookie", await buildSessionCookie({ role, userId: user.id, name: user.name }));
      return response;
    }

    if (mode === "client") {
      const code = String(body.code || "");
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "Zadejte 6místný přístupový kód" }, { status: 400 });
      }
      const client = await prisma.client.findUnique({
        where: { accessCode: code },
        select: { id: true, name: true, isActive: true },
      });
      if (!client || !client.isActive) {
        fail(ip);
        return NextResponse.json({ error: "Neplatný přístupový kód" }, { status: 401 });
      }
      const response = NextResponse.json({ success: true, role: "client", clientName: client.name });
      response.headers.set(
        "Set-Cookie",
        await buildSessionCookie({ role: "client", clientId: client.id, name: client.name })
      );
      return response;
    }

    return NextResponse.json({ error: "Neplatný režim přihlášení" }, { status: 400 });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Chyba serveru" }, { status: 500 });
  }
}
