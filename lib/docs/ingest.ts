import type { Document, Transaction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { putFile, extFromName } from "@/lib/storage";
import { extractDocument, onlyDigits, aiEnabled, type Extracted } from "./extract";
import { findCandidates, pickAutoMatch, type Candidate } from "./match";
import { recomputeTransaction } from "./rules";

export interface IngestInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  source: "web" | "telegram" | "email" | "accountant";
  uploadedBy: string; // owner | accountant | telegram | email
  clientId?: string | null;
  transactionId?: string | null;
  docType?: string | null; // якщо користувач вибрав тип вручну
  description?: string | null;
  linkedBy?: string;
  /** Лише фактури/чеки: AI перевіряє ДО збереження, решта відкидається (основна пошта). */
  requireFinancial?: boolean;
}

export interface IngestResult {
  skipped?: false;
  document: Document;
  duplicate: boolean;
  linkedTo: Transaction[];
  autoLinked: Transaction | null;
  candidates: Candidate[];
}

export async function linkDocument(transactionId: string, documentId: string, linkedBy: string) {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new Error("Transaction not found");
  await prisma.transactionDocument.upsert({
    where: { transactionId_documentId: { transactionId, documentId } },
    create: { transactionId, documentId, linkedBy },
    update: {},
  });
  await prisma.document.updateMany({ where: { id: documentId, clientId: null }, data: { clientId: tx.clientId } });
  await prisma.user.updateMany({ where: { tgAwaitingTxId: transactionId }, data: { tgAwaitingTxId: null } });
  return recomputeTransaction(transactionId);
}

export async function unlinkDocument(transactionId: string, documentId: string) {
  await prisma.transactionDocument.deleteMany({ where: { transactionId, documentId } });
  return recomputeTransaction(transactionId);
}

async function ownIcos(): Promise<Map<string, string>> {
  const profiles = await prisma.companyProfile.findMany({
    where: { ico: { not: null }, client: { type: "company" } },
    select: { ico: true, clientId: true },
  });
  const m = new Map<string, string>();
  for (const p of profiles) {
    const ico = onlyDigits(p.ico);
    if (ico && !m.has(ico)) m.set(ico, p.clientId);
  }
  return m;
}

function mapDocType(ex: Extracted, side: "in" | "out" | null): string {
  switch (ex.docType) {
    case "invoice":
    case "credit_note":
      return side === "out" ? "invoice_out" : "invoice_in";
    case "receipt":
    case "contract":
    case "cmr":
    case "customs":
    case "payslip":
      return ex.docType;
    default:
      return "other";
  }
}

async function applyExtraction(doc: Document, ex: Extracted, linkedTxAmount: number | null, userDocType?: string | null) {
  const icos = await ownIcos();
  const supplierIco = onlyDigits(ex.supplierIco);
  const customerIco = onlyDigits(ex.customerIco);
  let side: "in" | "out" | null = null;
  let clientFromIco: string | null = null;
  if (customerIco && icos.has(customerIco)) {
    side = "in";
    clientFromIco = icos.get(customerIco)!;
  } else if (supplierIco && icos.has(supplierIco)) {
    side = "out";
    clientFromIco = icos.get(supplierIco)!;
  } else if (linkedTxAmount != null) {
    side = linkedTxAmount > 0 ? "out" : "in";
  }

  const docType = userDocType || mapDocType(ex, side);
  const counterparty = docType === "invoice_out" ? ex.customerName : ex.supplierName;
  const issue = ex.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(ex.issueDate) ? new Date(ex.issueDate) : null;

  return prisma.document.update({
    where: { id: doc.id },
    data: {
      aiStatus: "done",
      extracted: ex as never,
      docType,
      clientId: doc.clientId ?? clientFromIco,
      extractedAmount: ex.totalAmount != null ? Math.abs(ex.totalAmount) : null,
      extractedCurrency: ex.currency?.toUpperCase() || null,
      extractedDate: issue && !isNaN(issue.getTime()) ? issue : null,
      extractedVs: onlyDigits(ex.variableSymbol) || onlyDigits(ex.documentNumber)?.slice(-10) || null,
      extractedIco: docType === "invoice_out" ? customerIco : supplierIco,
      extractedNumber: ex.documentNumber,
      extractedCounterparty: counterparty,
      description: doc.description || ex.summary,
    },
  });
}

export type IngestOutcome = IngestResult | { skipped: true; reason: string };

const FINANCIAL = new Set(["invoice", "receipt", "credit_note"]);

export async function ingestDocument(input: IngestInput & { requireFinancial: true }): Promise<IngestOutcome>;
export async function ingestDocument(input: IngestInput): Promise<IngestResult>;
export async function ingestDocument(input: IngestInput): Promise<IngestOutcome> {
  const sha = sha256Hex(input.buffer);
  const linkedBy = input.linkedBy || input.uploadedBy;

  // 1. Той самий файл уже є? — не дублюємо, лише прив'язуємо
  const existing = await prisma.document.findFirst({
    where: { sha256: sha },
    include: { links: { include: { transaction: true } } },
  });
  if (existing) {
    if (input.transactionId && !existing.links.some((l) => l.transactionId === input.transactionId)) {
      await linkDocument(input.transactionId, existing.id, linkedBy);
    }
    const fresh = await prisma.document.findUniqueOrThrow({
      where: { id: existing.id },
      include: { links: { include: { transaction: true } } },
    });
    return {
      document: fresh,
      duplicate: true,
      linkedTo: fresh.links.map((l) => l.transaction),
      autoLinked: null,
      candidates: fresh.links.length ? [] : await findCandidates(fresh),
    };
  }

  // 1b. Режим «лише фінансові документи» — розпізнаємо до збереження
  let preExtracted: Extracted | null | undefined;
  if (input.requireFinancial) {
    if (!aiEnabled()) return { skipped: true, reason: "AI вимкнено" };
    try {
      preExtracted = await extractDocument(input.buffer, input.fileName, input.mimeType);
    } catch (e) {
      return { skipped: true, reason: e instanceof Error ? e.message : "AI error" };
    }
    if (!preExtracted || !FINANCIAL.has(preExtracted.docType) || preExtracted.totalAmount == null) {
      return { skipped: true, reason: `не фактура (${preExtracted?.docType ?? "?"})` };
    }
  }

  // 2. Зберегти файл
  let clientId = input.clientId ?? null;
  let linkedTx: Transaction | null = null;
  if (input.transactionId) {
    linkedTx = await prisma.transaction.findUnique({ where: { id: input.transactionId } });
    if (linkedTx) clientId = clientId ?? linkedTx.clientId;
  }
  const month = new Date().toISOString().slice(0, 7);
  const key = `documents/${clientId || "inbox"}/${month}/${crypto.randomUUID()}${extFromName(input.fileName)}`;
  const fileUrl = await putFile(key, input.buffer, input.mimeType);

  let doc = await prisma.document.create({
    data: {
      clientId,
      filename: key,
      originalName: input.fileName,
      fileSize: input.buffer.length,
      mimeType: input.mimeType,
      fileUrl,
      uploadedBy: input.uploadedBy,
      source: input.source,
      description: input.description || null,
      docType: input.docType || null,
      sha256: sha,
      aiStatus: aiEnabled() ? "pending" : "skipped",
    },
  });

  if (linkedTx) await linkDocument(linkedTx.id, doc.id, linkedBy);

  // 3. AI-розпізнавання
  if (aiEnabled()) {
    try {
      const ex = preExtracted !== undefined ? preExtracted : await extractDocument(input.buffer, input.fileName, input.mimeType);
      doc = ex
        ? await applyExtraction(doc, ex, linkedTx ? Number(linkedTx.amount) : null, input.docType)
        : await prisma.document.update({ where: { id: doc.id }, data: { aiStatus: "failed" } });
      if (linkedTx) await recomputeTransaction(linkedTx.id); // тип документа міг змінитись
    } catch (e) {
      console.error("AI extraction failed:", e);
      doc = await prisma.document.update({ where: { id: doc.id }, data: { aiStatus: "failed" } });
    }
  }

  // 4. Автоприв'язка / кандидати
  let autoLinked: Transaction | null = null;
  let candidates: Candidate[] = [];
  if (!linkedTx) {
    candidates = await findCandidates(doc);
    const auto = pickAutoMatch(candidates);
    if (auto) {
      await linkDocument(auto.tx.id, doc.id, "auto");
      autoLinked = auto.tx;
      candidates = [];
    }
  }

  return {
    document: doc,
    duplicate: false,
    linkedTo: linkedTx ? [linkedTx] : autoLinked ? [autoLinked] : [],
    autoLinked,
    candidates,
  };
}

/**
 * Зворотний напрямок: прийшла виписка → шукаємо серед нерозібраних документів
 * (фактура прийшла раніше за оплату) і прив'язуємо впевнені збіги.
 */
export async function matchUnassignedDocuments(clientId?: string): Promise<Array<{ documentId: string; transactionId: string }>> {
  const docs = await prisma.document.findMany({
    where: {
      links: { none: {} },
      aiStatus: "done",
      extractedAmount: { not: null },
      createdAt: { gt: new Date(Date.now() - 180 * 86400_000) },
      ...(clientId ? { OR: [{ clientId }, { clientId: null }] } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const linked: Array<{ documentId: string; transactionId: string }> = [];
  for (const doc of docs) {
    const auto = pickAutoMatch(await findCandidates(doc));
    if (auto) {
      await linkDocument(auto.tx.id, doc.id, "auto");
      linked.push({ documentId: doc.id, transactionId: auto.tx.id });
    }
  }
  return linked;
}
