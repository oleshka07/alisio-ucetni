import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { recomputeTransaction } from "@/lib/docs/rules";
import { DOC_TYPES } from "@/lib/docs/types";

/** Змінити тип документа / компанію (напр. AI помилився). */
export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.docType !== undefined) {
    if (body.docType && !(body.docType in DOC_TYPES)) throw new HttpError(400, "Neplatný typ");
    data.docType = body.docType || null;
  }
  if (body.clientId !== undefined) data.clientId = body.clientId || null;
  const doc = await prisma.document.update({ where: { id }, data, include: { links: true } });
  for (const l of doc.links) await recomputeTransaction(l.transactionId);
  revalidatePath("/inbox");
  return NextResponse.json({ ok: true });
});
