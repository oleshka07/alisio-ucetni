import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff } from "@/lib/guard";
import { PUBLIC_FIELDS, accountData } from "@/lib/bank/account-fields";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const body = await req.json();
  const data = accountData(body);
  // зміна скриньки → почати читати заново (з останніх 45 днів)
  if (data.imapHost || data.imapUser || data.imapFolder) data.lastUid = null;
  const account = await prisma.bankAccount.update({ where: { id }, data: data as never, select: PUBLIC_FIELDS });
  return NextResponse.json({ account });
});

// Видалення рахунку стерло б операції — тож лише вимикаємо.
export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
});
