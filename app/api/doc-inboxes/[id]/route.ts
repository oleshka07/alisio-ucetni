import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const b = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "imapHost", "imapUser", "imapFolder", "senderFilter"]) if (typeof b[k] === "string") data[k] = b[k].trim() || null;
  if (b.clientId !== undefined) data.clientId = b.clientId || null;
  if (b.imapPort) data.imapPort = Number(b.imapPort);
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;
  if (["documents", "databox", "mixed"].includes(b.kind)) {
    data.kind = b.kind;
    data.lastUid = null;
  }
  if (b.imapPassword) data.imapPasswordEnc = encryptSecret(String(b.imapPassword));
  await prisma.documentInbox.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await prisma.documentInbox.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
