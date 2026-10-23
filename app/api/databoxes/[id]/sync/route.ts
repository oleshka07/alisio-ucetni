import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { syncDataBoxAccount } from "@/lib/databox/sync";

export const maxDuration = 60;

export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const acc = await prisma.dataBoxAccount.findUnique({ where: { id } });
  if (!acc) throw new HttpError(404, "Schránka nenalezena");
  return NextResponse.json(await syncDataBoxAccount(acc));
});
