import type { Document } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { ensureSystemRules, pickRule } from "./rules";
import { linkDocument } from "./ingest";

export const PAYMENT_METHODS = {
  cash: { cs: "Hotově", uk: "готівкою" },
  private_card: { cs: "Soukromou kartou", uk: "приватною карткою" },
  other: { cs: "Jinak mimo banku", uk: "інакше, мимо банку" },
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export function methodLabel(m: string | null | undefined, lang: "cs" | "uk" = "cs"): string {
  return m && m in PAYMENT_METHODS ? PAYMENT_METHODS[m as PaymentMethod][lang] : m || "";
}

/** Що бракує документу, щоб із нього можна було створити платіж мимо банку. null — усе є. */
export function manualPaymentBlocker(doc: Pick<Document, "extractedAmount" | "extractedDate" | "clientId" | "docType">): string | null {
  const missing: string[] = [];
  if (doc.extractedAmount == null || Number(doc.extractedAmount) === 0) missing.push("částka");
  if (!doc.extractedDate) missing.push("datum");
  if (!doc.clientId) missing.push("firma");
  if (!doc.docType || !["invoice_in", "invoice_out", "receipt"].includes(doc.docType)) missing.push("typ (faktura / účtenka)");
  return missing.length ? `Doplňte: ${missing.join(", ")}` : null;
}

/**
 * Платіж, що пройшов мимо банківського рахунку (готівка, приватна картка): створюємо з даних документа
 * і одразу прив'язуємо до нього документ. Видана фактура — прихід, інше — видаток.
 */
export async function createManualPayment(doc: Document, method: PaymentMethod) {
  const blocker = manualPaymentBlocker(doc);
  if (blocker) throw new Error(blocker);
  if (await prisma.transactionDocument.count({ where: { documentId: doc.id } })) throw new Error("Doklad už je přiřazen k platbě");

  const abs = Math.abs(Number(doc.extractedAmount));
  const amount = doc.docType === "invoice_out" ? abs : -abs;
  const tx = {
    clientId: doc.clientId!,
    amount,
    counterpartyName: doc.extractedCounterparty,
    counterpartyAccount: null,
    variableSymbol: doc.extractedVs,
    message: `${PAYMENT_METHODS[method].cs}: ${doc.extractedNumber ? `doklad č. ${doc.extractedNumber}` : doc.originalName}`,
  };
  await ensureSystemRules();
  const rules = await prisma.docRequirementRule.findMany({ where: { isActive: true } });
  const outcome = pickRule(rules, tx);

  const created = await prisma.transaction.create({
    data: {
      ...tx,
      bookingDate: doc.extractedDate!,
      currency: doc.extractedCurrency || "CZK",
      paymentMethod: method,
      dedupHash: sha256Hex(`manual|${doc.id}`).slice(0, 40),
      category: outcome.category,
      requiredDocs: outcome.notNeeded ? [] : outcome.requiredDocs,
      docHint: outcome.docHint,
      ruleId: outcome.ruleId,
      docStatus: outcome.notNeeded ? "not_needed" : "missing",
    },
  });
  await linkDocument(created.id, doc.id, "manual");
  return created;
}
