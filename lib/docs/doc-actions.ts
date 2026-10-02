import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/guard";
import { recomputeTransaction } from "@/lib/docs/rules";
import { DOC_TYPES } from "@/lib/docs/types";
import { deleteFile } from "@/lib/storage";
import { findCandidates, pickAutoMatch } from "@/lib/docs/match";
import { linkDocument } from "@/lib/docs/ingest";

/**
 * Зміни документа з веба (окремий документ або масова дія):
 * тип, фірма, виправлені дані розпізнавання, архів.
 * Повертає id платежу, якщо після змін документ автоматично прив'язався.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateDocument(id: string, body: Record<string, any>): Promise<{ autoLinked: string | null }> {
  const data: Record<string, unknown> = {};
  if (body.docType !== undefined) {
    if (body.docType && !(body.docType in DOC_TYPES)) throw new HttpError(400, "Neplatný typ");
    data.docType = body.docType || null;
  }
  if (body.clientId !== undefined) data.clientId = body.clientId || null;
  // Ручне виправлення того, що розпізнав AI
  const text = (k: string, max = 200) => {
    if (body[k] === undefined) return;
    const v = String(body[k] ?? "").trim();
    data[k] = v ? v.slice(0, max) : null;
  };
  text("extractedCounterparty");
  text("extractedNumber", 60);
  text("extractedVs", 10);
  text("extractedIco", 12);
  if (body.extractedCurrency !== undefined) data.extractedCurrency = String(body.extractedCurrency || "").trim().toUpperCase().slice(0, 3) || null;
  if (body.extractedAmount !== undefined) {
    const raw = String(body.extractedAmount ?? "").replace(/[\s\u00a0]/g, "").replace(",", ".");
    if (raw && !Number.isFinite(Number(raw))) throw new HttpError(400, "Neplatná částka");
    data.extractedAmount = raw ? Math.abs(Number(raw)) : null;
  }
  if (body.extractedDate !== undefined) {
    const d = String(body.extractedDate || "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "Neplatné datum");
    data.extractedDate = d ? new Date(d) : null;
  }
  // firemní dokumenty: kategorie, platnost, popis
  if (body.docCategory !== undefined) data.docCategory = body.docCategory ? String(body.docCategory).slice(0, 30) : null;
  if (body.validUntil !== undefined) {
    const d = String(body.validUntil || "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "Neplatné datum");
    data.validUntil = d ? new Date(d) : null;
  }
  text("description", 500);
  const edited = Object.keys(data).some((k) => k.startsWith("extracted"));
  if (edited) data.aiStatus = "done";

  // Архів: документ зайвий (спам, дубль, помилково додано). Відв'язуємо від платежів,
  // щоб вони знову показували, чого бракує. Файл лишається — можна повернути.
  if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;
  const before = body.archived ? await prisma.transactionDocument.findMany({ where: { documentId: id } }) : [];
  if (body.archived) await prisma.transactionDocument.deleteMany({ where: { documentId: id } });
  const doc = await prisma.document.update({ where: { id }, data, include: { links: true } });
  const txIds = new Set([...doc.links, ...before].map((l) => l.transactionId));
  for (const t of txIds) await recomputeTransaction(t);
  // після виправлення даних неприв'язаний документ пробуємо знову зіставити з платежем
  let autoLinked: string | null = null;
  if ((edited || data.docType !== undefined || data.clientId !== undefined) && !doc.links.length && !doc.archivedAt && !doc.companyDoc) {
    const auto = pickAutoMatch(await findCandidates(doc));
    if (auto) {
      await linkDocument(auto.tx.id, doc.id, "auto");
      autoLinked = auto.tx.id;
    }
  }
  return { autoLinked };
}

/** Остаточне видалення — лише з архіву (перевірку ролі робить виклик). */
export async function deleteArchivedDocument(id: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id }, include: { links: true } });
  if (!doc) throw new HttpError(404, "Doklad nenalezen");
  if (!doc.archivedAt) throw new HttpError(400, "Nejdřív doklad archivujte");
  await prisma.task.updateMany({ where: { documentId: id }, data: { documentId: null } });
  await prisma.document.delete({ where: { id } });
  for (const l of doc.links) await recomputeTransaction(l.transactionId);
  await deleteFile(doc.fileUrl).catch((e) => console.error("deleteFile", e));
}
