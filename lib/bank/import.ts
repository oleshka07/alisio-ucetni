import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { ensureSystemRules, normalizeAccount, pickRule } from "@/lib/docs/rules";
import type { ParsedStatement, ParsedTransaction } from "./types";

export function dedupHash(bankAccountId: string, t: ParsedTransaction): string {
  const key = t.externalId
    ? `${bankAccountId}|id|${t.externalId}`
    : `${bankAccountId}|${t.date}|${t.amount.toFixed(2)}|${t.counterpartyAccount || ""}|${t.variableSymbol || ""}|${t.message}`;
  return sha256Hex(key).slice(0, 40);
}

export function sameAccount(acc: Pick<BankAccount, "accountNumber" | "iban">, st: ParsedStatement): boolean {
  const mine = [acc.accountNumber, acc.iban].map(normalizeAccount).filter(Boolean);
  const theirs = [st.accountNumber, st.iban].map(normalizeAccount).filter(Boolean);
  if (!mine.length || !theirs.length) return true; // не з чим порівнювати
  return mine.some((m) => theirs.includes(m));
}

/**
 * Скринька може отримувати виписки кількох рахунків. Шукаємо рахунок, до якого
 * належить виписка: спершу «свій», потім будь-який інший активний.
 */
export async function resolveAccountForStatement(preferred: BankAccount, st: ParsedStatement): Promise<BankAccount | null> {
  if (sameAccount(preferred, st)) return preferred;
  const all = await prisma.bankAccount.findMany({ where: { isActive: true } });
  return all.find((a) => a.id !== preferred.id && (a.accountNumber || a.iban) && sameAccount(a, st)) ?? null;
}

export interface ImportResult {
  statementId: string | null;
  total: number;
  imported: number;
  skippedDuplicate: boolean;
}

export async function importStatement(
  account: BankAccount,
  st: ParsedStatement,
  meta: { source: "imap" | "fio" | "upload"; externalId: string; fileName?: string }
): Promise<ImportResult> {
  const existing = await prisma.bankStatement.findUnique({
    where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: meta.externalId } },
  });
  if (existing) return { statementId: existing.id, total: existing.txCount, imported: 0, skippedDuplicate: true };

  // якщо в рахунку ще не заповнено номер/IBAN — беремо з виписки
  if (!account.accountNumber && !account.iban && (st.accountNumber || st.iban)) {
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { accountNumber: st.accountNumber && !st.accountNumber.startsWith("CZ") ? st.accountNumber : null, iban: st.iban },
    });
  }

  await ensureSystemRules();
  const rules = await prisma.docRequirementRule.findMany({ where: { isActive: true } });
  const own = (await prisma.bankAccount.findMany({ select: { accountNumber: true, iban: true } }))
    .flatMap((a) => [a.accountNumber, a.iban])
    .filter((x): x is string => !!x);

  const statement = await prisma.bankStatement.create({
    data: {
      bankAccountId: account.id,
      source: meta.source,
      externalId: meta.externalId,
      fileName: meta.fileName,
      periodFrom: st.periodFrom ? new Date(st.periodFrom) : null,
      periodTo: st.periodTo ? new Date(st.periodTo) : null,
      openingBalance: st.openingBalance,
      closingBalance: st.closingBalance,
      txCount: st.transactions.length,
    },
  });

  const rows = st.transactions.map((t) => {
    const outcome = pickRule(rules, { clientId: account.clientId, ...t }, own);
    return {
      clientId: account.clientId,
      bankAccountId: account.id,
      statementId: statement.id,
      bookingDate: new Date(t.date),
      amount: t.amount,
      currency: t.currency || account.currency,
      counterpartyName: t.counterpartyName,
      counterpartyAccount: t.counterpartyAccount,
      variableSymbol: t.variableSymbol,
      constantSymbol: t.constantSymbol,
      specificSymbol: t.specificSymbol,
      message: t.message || null,
      externalId: t.externalId,
      dedupHash: dedupHash(account.id, t),
      category: outcome.category,
      requiredDocs: outcome.requiredDocs,
      docHint: outcome.docHint,
      ruleId: outcome.ruleId,
      docStatus: outcome.notNeeded ? "not_needed" : "missing",
    };
  });

  const created = rows.length ? await prisma.transaction.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  await prisma.bankStatement.update({ where: { id: statement.id }, data: { importedCount: created.count } });

  return { statementId: statement.id, total: rows.length, imported: created.count, skippedDuplicate: false };
}
