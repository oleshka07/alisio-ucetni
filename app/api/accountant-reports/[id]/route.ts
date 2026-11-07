import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff } from "@/lib/guard";
import { parseEmails } from "@/lib/finance/accountant-report";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (b.email !== undefined) data.email = parseEmails(b.email);
  if (b.dayOfMonth !== undefined) data.dayOfMonth = Math.min(28, Math.max(1, Number(b.dayOfMonth) || 10));
  if (b.senderInboxId !== undefined) data.senderInboxId = b.senderInboxId || null;
  if (typeof b.attachZip === "boolean") data.attachZip = b.attachZip;
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;
  if (b.note !== undefined) data.note = b.note ? String(b.note).slice(0, 1000) : null;
  await prisma.accountantReport.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await prisma.accountantReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
