import type { Document, Transaction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface Candidate {
  tx: Transaction;
  score: number;
  reasons: string[];
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !["sro", "spol", "the", "ltd", "gmbh", "inc"].includes(t))
  );
}

function nameOverlap(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / Math.min(A.size, B.size);
}

/**
 * Кандидати-операції для документа.
 * Бали: сума збігається (50), VS збігається (40), назва контрагента (до 10), близькість дат (до 10).
 * Напрямок: видана фактура ↔ прихід, вхідна ↔ видаток.
 */
export async function findCandidates(doc: Document, limit = 5): Promise<Candidate[]> {
  const amount = doc.extractedAmount != null ? Math.abs(Number(doc.extractedAmount)) : null;
  const vs = doc.extractedVs;
  if (amount == null && !vs) return [];

  const anchor = doc.extractedDate ?? doc.createdAt;
  const from = new Date(anchor.getTime() - 45 * 86400_000);
  const to = new Date(anchor.getTime() + 120 * 86400_000);

  const direction = doc.docType === "invoice_out" ? "in" : doc.docType === "invoice_in" || doc.docType === "receipt" ? "out" : null;

  const txs = await prisma.transaction.findMany({
    where: {
      ...(doc.clientId ? { clientId: doc.clientId } : {}),
      docStatus: { in: ["missing", "partial"] },
      bookingDate: { gte: from, lte: to },
      ...(direction === "in" ? { amount: { gt: 0 } } : direction === "out" ? { amount: { lt: 0 } } : {}),
    },
    orderBy: { bookingDate: "desc" },
    take: 500,
  });

  const out: Candidate[] = [];
  for (const tx of txs) {
    const reasons: string[] = [];
    let score = 0;
    const txAbs = Math.abs(Number(tx.amount));
    const sameCcy = !doc.extractedCurrency || doc.extractedCurrency === tx.currency;
    if (amount != null && sameCcy) {
      const diff = Math.abs(txAbs - amount);
      if (diff < 0.01) {
        score += 50;
        reasons.push("сума");
      } else if (diff <= Math.max(1, amount * 0.005)) {
        score += 35;
        reasons.push("сума ≈");
      }
    }
    if (vs && tx.variableSymbol && tx.variableSymbol.replace(/^0+/, "") === vs.replace(/^0+/, "")) {
      score += 40;
      reasons.push("VS");
    }
    const ov = nameOverlap(doc.extractedCounterparty, `${tx.counterpartyName || ""} ${tx.message || ""}`);
    if (ov > 0) {
      score += Math.round(10 * ov);
      reasons.push("назва");
    }
    const days = Math.abs(tx.bookingDate.getTime() - anchor.getTime()) / 86400_000;
    score += Math.max(0, Math.round(10 - days / 6));
    if (score >= 45) out.push({ tx, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Автоприв'язка лише коли впевнені: сума + VS, або точна сума і єдиний сильний кандидат. */
export function pickAutoMatch(cands: Candidate[]): Candidate | null {
  if (!cands.length) return null;
  const [best, second] = cands;
  const hasAmount = best.reasons.includes("сума");
  const hasVs = best.reasons.includes("VS");
  if (hasAmount && hasVs && (!second || best.score - second.score >= 20)) return best;
  if (hasAmount && best.reasons.includes("назва") && !second) return best;
  return null;
}
