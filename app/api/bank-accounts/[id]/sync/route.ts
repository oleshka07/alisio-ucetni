import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { syncBankAccount } from "@/lib/bank/sync";

export const maxDuration = 60;

export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) throw new HttpError(404, "Účet nenalezen");
  return NextResponse.json(await syncBankAccount(account));
});
