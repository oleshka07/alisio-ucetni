import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { recomputeTransaction } from "@/lib/docs/rules";
import { DOC_TYPES } from "@/lib/docs/types";
import { deleteFile } from "@/lib/storage";

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
  // Архів: документ зайвий (спам, дубль, помилково додано). Відв'язуємо від платежів,
  // щоб вони знову показували, чого бракує. Файл лишається — можна повернути.
  if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;
  const before = body.archived ? await prisma.transactionDocument.findMany({ where: { documentId: id } }) : [];
  if (body.archived) await prisma.transactionDocument.deleteMany({ where: { documentId: id } });
  const doc = await prisma.document.update({ where: { id }, data, include: { links: true } });
  const txIds = new Set([...doc.links, ...before].map((l) => l.transactionId));
  for (const t of txIds) await recomputeTransaction(t);
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  return NextResponse.json({ ok: true });
});

/** Остаточне видалення — лише з архіву і лише власник. */
export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id }, include: { links: true } });
  if (!doc) throw new HttpError(404, "Doklad nenalezen");
  if (!doc.archivedAt) throw new HttpError(400, "Nejdřív doklad archivujte");
  await prisma.task.updateMany({ where: { documentId: id }, data: { documentId: null } });
  await prisma.document.delete({ where: { id } });
  for (const l of doc.links) await recomputeTransaction(l.transactionId);
  await deleteFile(doc.fileUrl).catch((e) => console.error("deleteFile", e));
  revalidatePath("/inbox");
  return NextResponse.json({ ok: true });
});
