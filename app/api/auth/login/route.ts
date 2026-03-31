import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, buildSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, password, code } = body;

    if (mode === "accountant") {
      const authPassword = process.env.AUTH_PASSWORD;
      if (!authPassword) {
        return NextResponse.json(
          { error: "AUTH_PASSWORD не налаштований на сервері" },
          { status: 500 }
        );
      }
      if (password !== authPassword) {
        return NextResponse.json({ error: "Nesprávné heslo" }, { status: 401 });
      }

      const token = await createToken("accountant");
      const cookie = buildSessionCookie({ role: "accountant", token });

      const response = NextResponse.json({ success: true, role: "accountant" });
      response.headers.set("Set-Cookie", cookie);
      return response;
    }

    if (mode === "client") {
      if (!code || typeof code !== "string" || code.length !== 6) {
        return NextResponse.json(
          { error: "Zadejte 6místný přístupový kód" },
          { status: 400 }
        );
      }

      const client = await prisma.client.findUnique({
        where: { accessCode: code },
        select: { id: true, name: true, isActive: true },
      });

      if (!client || !client.isActive) {
        return NextResponse.json(
          { error: "Neplatný přístupový kód" },
          { status: 401 }
        );
      }

      const token = await createToken("client", client.id);
      const cookie = buildSessionCookie({
        role: "client",
        clientId: client.id,
        token,
      });

      const response = NextResponse.json({
        success: true,
        role: "client",
        clientName: client.name,
      });
      response.headers.set("Set-Cookie", cookie);
      return response;
    }

    return NextResponse.json({ error: "Neplatný režim přihlášení" }, { status: 400 });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Chyba serveru" }, { status: 500 });
  }
}
