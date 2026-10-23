import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";
import { getOwnerInfo } from "@/lib/databox/isds";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const acc = await prisma.dataBoxAccount.findUnique({ where: { id } });
  if (!acc) throw new HttpError(404, "Schránka nenalezena");
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 120);
  if (typeof b.clientId === "string" && b.clientId) data.clientId = b.clientId;
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;
  if (b.password) {
    // nové heslo po změně ve schránce — ověřit, než ho uložíme
    await getOwnerInfo({ environment: acc.environment, username: acc.username, password: String(b.password) }).catch((e) => {
      throw new HttpError(400, e instanceof Error ? e.message : "Přihlášení do ISDS selhalo");
    });
    Object.assign(data, { passwordEnc: encryptSecret(String(b.password)), passwordCheckedAt: null, lastError: null, failCount: 0 });
  }
  await prisma.dataBoxAccount.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await prisma.dataBoxAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
