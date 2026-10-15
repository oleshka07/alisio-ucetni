import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff } from "@/lib/guard";

type Ctx = { params: Promise<{ id: string }> };

/** Zrušit token — konektor s ním okamžitě přestane fungovat. */
export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await prisma.apiToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
});
