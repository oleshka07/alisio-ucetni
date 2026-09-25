import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { syncDocumentInbox } from "@/lib/docs/inbox-sync";

export const maxDuration = 60;

export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const inbox = await prisma.documentInbox.findUnique({ where: { id } });
  if (!inbox) throw new HttpError(404, "Schránka nenalezena");
  return NextResponse.json(await syncDocumentInbox(inbox));
});
