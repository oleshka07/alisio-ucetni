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

/** Рахунок, якому належить виписка, серед усіх активних — лише за номером/IBAN (без «запасного» вибору). */
export async function findAccountForStatement(st: ParsedStatement): Promise<BankAccount | null> {
  const all = await prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  return all.find((a) => (a.accountNumber || a.iban) && sameAccount(a, st)) ?? null;
}

/** „SWIPE SCAPE S.R.O.“ і „Swipe Scape s.r.o.“ → „swipescape“ */
export function companyKey(name: string | null | undefined): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?\s?r\.?\s?o\.?|a\.?\s?s\.?|spol\.?|k\.?\s?s\.?|v\.?\s?o\.?\s?s\.?)\s*$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const BANK_WORDS: Record<string, string[]> = {
  "Komerční banka": ["kb", "komercni"],
  "Česká spořitelna": ["cs", "ceska", "cesca", "sporitelna", "csas", "george"],
};

/** Наскільки рахунок без номера схожий на рахунок з виписки (валюта, банк у назві). */
export function accountScore(a: Pick<BankAccount, "name" | "currency">, st: ParsedStatement): number {
  const words = companyKey(a.name) ? a.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/) : [];
  const cur = st.currency.toLowerCase();
  // měna v názvu účtu váží víc než pole „měna“ (to má výchozí CZK, i když ho nikdo nenastavil)
  let score = a.currency.toUpperCase() === st.currency ? 2 : -1;
  if (words.includes(cur)) score += 2;
  else if (words.some((w) => ["czk", "eur", "usd", "gbp", "pln"].includes(w))) score -= 3;
  const bankWords = st.bank ? BANK_WORDS[st.bank] ?? [] : [];
  const otherWords = Object.entries(BANK_WORDS).filter(([b]) => b !== st.bank).flatMap(([, w]) => w);
  if (words.some((w) => bankWords.includes(w))) score += 1;
  else if (words.some((w) => otherWords.includes(w))) score -= 5; // jiná banka v názvu = jiný účet
  return score;
}

/**
 * Výpis je na jinou firmu, než ke které je účet v systému přiřazen? (např. účet omylem založen u jiné firmy)
 * Vrací text chyby, nebo null. Bez názvu firmy ve výpisu nekontrolujeme.
 */
export async function ownerMismatch(account: BankAccount, st: ParsedStatement): Promise<string | null> {
  const key = companyKey(st.accountName);
  if (!key) return null;
  const client = await prisma.client.findUnique({ where: { id: account.clientId }, include: { companyProfile: true } });
  if (!client || companyKey(client.name) === key || companyKey(client.companyProfile?.companyName) === key) return null;
  return `Výpis je na firmu „${st.accountName}“, ale účet „${account.name}“ je v systému u firmy „${client.name}“. Opravte firmu u účtu (Nastavení → Bankovní účty → Upravit) a nahrajte výpis znovu.`;
}

export interface AccountResolution {
  account: BankAccount | null;
  created?: boolean;
  reason?: string;
}

/**
 * Куди покласти виписку: 1) рахунок з тим самим номером/IBAN; 2) фірма за назвою рахунку у виписці →
 * її рахунок без номера, що пасує за валютою й банком (номер допишеться); 3) нема такого — створюємо рахунок цій фірмі.
 */
export async function findOrCreateAccountForStatement(st: ParsedStatement): Promise<AccountResolution> {
  const byNumber = await findAccountForStatement(st);
  if (byNumber) {
    const bad = await ownerMismatch(byNumber, st);
    return bad ? { account: null, reason: bad } : { account: byNumber };
  }
  const who = st.accountNumber || st.iban || "?";
  const key = companyKey(st.accountName);
  if (!key) return { account: null, reason: `Účet ${who} (${st.currency}) není v Nastavení → Bankovní účty a výpis neuvádí název firmy` };

  const clients = await prisma.client.findMany({ where: { isActive: true }, include: { companyProfile: true, bankAccounts: { where: { isActive: true } } } });
  const client = clients.find((c) => companyKey(c.name) === key || companyKey(c.companyProfile?.companyName) === key);
  if (!client) {
    return { account: null, reason: `Výpis účtu ${who} patří firmě „${st.accountName}“, která v systému není — přidejte ji v Klienti a nahrajte výpis znovu` };
  }

  const candidates = client.bankAccounts
    .filter((a) => !a.accountNumber && !a.iban)
    .map((a) => ({ a, score: accountScore(a, st) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  if (candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
    return { account: candidates[0].a };
  }

  const short = st.bank === "Česká spořitelna" ? "ČS" : st.bank === "Komerční banka" ? "KB" : st.bank || "Účet";
  const account = await prisma.bankAccount.create({
    data: {
      clientId: client.id,
      name: `${short} ${st.currency}`,
      accountNumber: st.accountNumber && !/^[A-Z]{2}\d/.test(st.accountNumber) ? st.accountNumber : null,
      iban: st.iban,
      currency: st.currency,
      source: "manual",
    },
  });
  return { account, created: true };
}

export function sameAccount(acc: Pick<BankAccount, "accountNumber" | "iban">, st: ParsedStatement): boolean {
  const mine = [acc.accountNumber, acc.iban].map(normalizeAccount).filter(Boolean);
  const theirs = [st.accountNumber, st.iban].map(normalizeAccount).filter(Boolean);
  if (!mine.length || !theirs.length) return true; // не з чим порівнювати
  return mine.some((m) => theirs.includes(m));
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
  meta: { source: "imap" | "fio" | "upload"; externalId: string; fileName?: string; fileUrl?: string }
): Promise<ImportResult> {
  const existing = await prisma.bankStatement.findUnique({
    where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: meta.externalId } },
  });
  if (existing) {
    // виписку імпортували ще до того, як ми почали зберігати файли — доберемо файл
    if (!existing.fileUrl && meta.fileUrl) {
      await prisma.bankStatement.update({ where: { id: existing.id }, data: { fileUrl: meta.fileUrl, fileName: meta.fileName ?? existing.fileName } });
    }
    return { statementId: existing.id, total: existing.txCount, imported: 0, skippedDuplicate: true };
  }

  // якщо в рахунку ще не заповнено номер/IBAN — беремо з виписки
  if (!account.accountNumber && !account.iban && (st.accountNumber || st.iban)) {
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { accountNumber: st.accountNumber && !st.accountNumber.startsWith("CZ") ? st.accountNumber : null, iban: st.iban, currency: st.currency },
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
      fileUrl: meta.fileUrl,
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

  const fresh = await withoutOverlaps(account.id, rows);
  const created = fresh.length ? await prisma.transaction.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  await prisma.bankStatement.update({ where: { id: statement.id }, data: { importedCount: created.count } });

  return { statementId: statement.id, total: rows.length, imported: created.count, skippedDuplicate: false };
}

type Row = { bookingDate: Date; amount: number; variableSymbol: string | null; dedupHash: string };

/**
 * Одна й та сама операція може прийти в різних форматах (PDF-виписка, CSV, «přehled plateb»),
 * у яких різні ідентифікатори. Тому пропускаємо операцію, якщо на рахунку вже є така ж
 * за датою й сумою (і VS, коли він є з обох боків). Кожна наявна операція «закриває» лише одну нову,
 * тож дві справді однакові платби в одній виписці не зіллються.
 */
export async function withoutOverlaps<T extends Row>(bankAccountId: string, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const times = rows.map((r) => r.bookingDate.getTime());
  const existing = await prisma.transaction.findMany({
    where: { bankAccountId, bookingDate: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
    select: { bookingDate: true, amount: true, variableSymbol: true, dedupHash: true },
  });
  return filterOverlaps(existing.map((e) => ({ ...e, amount: Number(e.amount) })), rows);
}

export function filterOverlaps<T extends Row>(existing: Row[], rows: T[]): T[] {
  const hashes = new Set(existing.map((e) => e.dedupHash));
  const pool = existing.map((e) => ({ key: `${e.bookingDate.toISOString().slice(0, 10)}|${e.amount.toFixed(2)}`, vs: e.variableSymbol, used: false }));
  return rows.filter((r) => {
    if (hashes.has(r.dedupHash)) return false; // точний дубль — відсіє і skipDuplicates
    const key = `${r.bookingDate.toISOString().slice(0, 10)}|${r.amount.toFixed(2)}`;
    const hit = pool.find((p) => !p.used && p.key === key && (!p.vs || !r.variableSymbol || p.vs === r.variableSymbol));
    if (!hit) return true;
    hit.used = true;
    return false;
  });
}
