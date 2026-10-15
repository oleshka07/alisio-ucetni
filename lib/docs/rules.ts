import type { DocRequirementRule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Правила «який платіж → які документи потрібні».
 * Перше правило (за priority, менше = раніше), що підійшло, визначає категорію,
 * список обов'язкових документів і підказку.
 */

type SystemRule = Omit<Prisma.DocRequirementRuleCreateInput, "client">;

export const SYSTEM_RULES: SystemRule[] = [
  {
    name: "Daně a pojistné (účty ČNB …/0710)",
    priority: 10,
    accountContains: "/0710",
    category: "tax",
    notNeeded: true,
    hint: "Платіж податковій / соцстраху — документ не потрібен, достатньо виписки.",
  },
  {
    name: "Bankovní poplatky",
    priority: 20,
    direction: "out",
    messageContains: "poplatek|popl.|vedení účtu|vedeni uctu|ceny za služby|cena za|fee|úrok|urok",
    maxAbsAmount: 2000,
    category: "fee",
    notNeeded: true,
    hint: "Комісія банку — документ не потрібен.",
  },
  {
    name: "Bankovní bonusy a úroky",
    priority: 21,
    direction: "in",
    messageContains: "bonus za vedení|bonus za vedeni|moje odměny|moje odmeny|připsaný úrok|pripsany urok|kreditní úrok|úrok|urok",
    maxAbsAmount: 2000,
    category: "fee",
    notNeeded: true,
    hint: "Бонус / відсотки від банку — документ не потрібен.",
  },
  {
    name: "Hotovost — bankomat",
    priority: 22,
    messageContains: "výběr hotovosti|vyber hotovosti|vklad přes atm|vklad pres atm|bankomat|atm",
    category: "cash",
    notNeeded: true,
    hint: "Зняття / внесок готівки — документ не потрібен. Чеки за покупки готівкою додавайте як ruční platba (hotově).",
  },
  {
    name: "Meta / Facebook reklama",
    priority: 30,
    direction: "out",
    counterpartyContains: "facebook|facebk|meta platforms|instagram",
    category: "ads_foreign",
    requiredDocs: ["invoice_in"],
    hint: "Інвойс з Meta Business Suite → Billing & payments → Payment activity. Це reverse charge — ПДВ нараховуємо самі.",
  },
  {
    name: "Google (Ads, Workspace)",
    priority: 31,
    direction: "out",
    counterpartyContains: "google",
    category: "ads_foreign",
    requiredDocs: ["invoice_in"],
    hint: "Інвойс з Google Ads → Billing → Documents (або Google Workspace → Billing). Reverse charge.",
  },
  {
    name: "Mzdy",
    priority: 40,
    direction: "out",
    messageContains: "mzda|výplata|vyplata|mzdy",
    category: "salary",
    notNeeded: true,
    hint: "Зарплата — výplatní pásky готує бухгалтер.",
  },
  {
    name: "Příjem — výchozí",
    priority: 1000,
    direction: "in",
    category: "customer",
    requiredDocs: ["invoice_out"],
    hint: "Видана фактура клієнту (faktura vydaná) на цю суму.",
  },
  {
    name: "Výdaj — výchozí",
    priority: 1000,
    direction: "out",
    category: "supplier",
    requiredDocs: ["invoice_in"],
    hint: "Фактура або чек від постачальника (faktura přijatá / účtenka).",
  },
];

/** Системні правила: нові додати, змінені в коді — оновити (вимкнення користувачем зберігається). */
export async function ensureSystemRules() {
  const existing = await prisma.docRequirementRule.findMany({ where: { isSystem: true } });
  const byName = new Map(existing.map((r) => [r.name, r]));
  const missing = SYSTEM_RULES.filter((r) => !byName.has(r.name));
  if (missing.length) {
    await prisma.docRequirementRule.createMany({ data: missing.map((r) => ({ ...r, isSystem: true })) as never });
  }
  for (const def of SYSTEM_RULES) {
    const cur = byName.get(def.name);
    if (!cur) continue;
    const want = {
      priority: def.priority ?? 100, direction: def.direction ?? "any", messageContains: def.messageContains ?? null,
      counterpartyContains: def.counterpartyContains ?? null, accountContains: def.accountContains ?? null,
      maxAbsAmount: def.maxAbsAmount != null ? Number(def.maxAbsAmount) : null, category: def.category ?? null, notNeeded: def.notNeeded ?? false,
      requiredDocs: (def.requiredDocs as string[] | undefined) ?? [], hint: def.hint ?? null,
    };
    const differs =
      cur.priority !== want.priority || cur.direction !== want.direction || cur.messageContains !== want.messageContains ||
      cur.counterpartyContains !== want.counterpartyContains || cur.accountContains !== want.accountContains ||
      (cur.maxAbsAmount == null ? null : Number(cur.maxAbsAmount)) !== want.maxAbsAmount || cur.category !== want.category ||
      cur.notNeeded !== want.notNeeded || cur.requiredDocs.join() !== want.requiredDocs.join() || cur.hint !== want.hint;
    if (differs) await prisma.docRequirementRule.update({ where: { id: cur.id }, data: want });
  }
}

/** Після зміни правил — перерахувати операції без ручного статусу. */
export async function reapplyRules(): Promise<{ checked: number; changed: number }> {
  await ensureSystemRules();
  const rules = await prisma.docRequirementRule.findMany({ where: { isActive: true } });
  const own = (await prisma.bankAccount.findMany({ select: { accountNumber: true, iban: true } }))
    .flatMap((a) => [a.accountNumber, a.iban])
    .filter((x): x is string => !!x);
  const txs = await prisma.transaction.findMany({ where: { docStatusManual: false } });
  let changed = 0;
  for (const tx of txs) {
    const o = pickRule(rules, { ...tx, amount: Number(tx.amount) }, own);
    if (o.ruleId !== tx.ruleId || o.category !== tx.category || o.requiredDocs.join() !== tx.requiredDocs.join()) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { ruleId: o.ruleId, category: o.category, requiredDocs: o.requiredDocs, docHint: o.docHint },
      });
      await recomputeTransaction(tx.id);
      changed++;
    }
  }
  return { checked: txs.length, changed };
}

export interface TxLike {
  clientId: string;
  amount: number;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
  message?: string | null;
  variableSymbol?: string | null;
}

function containsAny(haystack: string, pattern: string | null | undefined): boolean {
  if (!pattern) return true;
  const h = haystack.toLowerCase();
  return pattern
    .toLowerCase()
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => h.includes(p));
}

export function ruleMatches(rule: DocRequirementRule, tx: TxLike): boolean {
  if (!rule.isActive) return false;
  if (rule.clientId && rule.clientId !== tx.clientId) return false;
  if (rule.direction === "in" && tx.amount <= 0) return false;
  if (rule.direction === "out" && tx.amount >= 0) return false;
  const abs = Math.abs(tx.amount);
  if (rule.minAbsAmount != null && abs < Number(rule.minAbsAmount)) return false;
  if (rule.maxAbsAmount != null && abs > Number(rule.maxAbsAmount)) return false;
  const nameAndMsg = `${tx.counterpartyName || ""} ${tx.message || ""}`;
  if (!containsAny(nameAndMsg, rule.counterpartyContains)) return false;
  if (!containsAny(tx.counterpartyAccount || "", rule.accountContains)) return false;
  if (!containsAny(`${tx.message || ""} ${tx.variableSymbol || ""}`, rule.messageContains)) return false;
  return true;
}

export interface RuleOutcome {
  ruleId: string | null;
  category: string | null;
  requiredDocs: string[];
  docHint: string | null;
  notNeeded: boolean;
}

export function pickRule(rules: DocRequirementRule[], tx: TxLike, ownAccounts: string[] = []): RuleOutcome {
  const acct = normalizeAccount(tx.counterpartyAccount);
  if (acct && ownAccounts.some((a) => normalizeAccount(a) === acct)) {
    return { ruleId: null, category: "internal", requiredDocs: [], docHint: "Переказ між власними рахунками.", notNeeded: true };
  }
  const sorted = [...rules].sort(
    (a, b) => a.priority - b.priority || Number(!!b.clientId) - Number(!!a.clientId) // правило компанії перед загальним
  );
  const rule = sorted.find((r) => ruleMatches(r, tx));
  if (!rule) return { ruleId: null, category: "other", requiredDocs: ["other"], docHint: null, notNeeded: false };
  return {
    ruleId: rule.id,
    category: rule.category,
    requiredDocs: rule.notNeeded ? [] : rule.requiredDocs.length ? rule.requiredDocs : ["other"],
    docHint: rule.hint,
    notNeeded: rule.notNeeded,
  };
}

export function normalizeAccount(a: string | null | undefined): string | null {
  if (!a) return null;
  const s = a.replace(/\s+/g, "").toUpperCase();
  // CZ IBAN → 123456789/0800
  const m = /^CZ\d{2}(\d{4})(\d{6})(\d{10})$/.exec(s);
  if (m) {
    const prefix = m[2].replace(/^0+/, "");
    const number = m[3].replace(/^0+/, "");
    return `${prefix ? prefix + "-" : ""}${number}/${m[1]}`;
  }
  return s.replace(/^0+/, "");
}

/** Для кожного обов'язкового типу: чи він закритий (та сама логіка, що в computeDocStatus). */
export function requirementCoverage(requiredDocs: string[], linkedTypes: Array<string | null>): boolean[] {
  const covered = requiredDocs.map(() => false);
  const generic: Array<string | null> = [];
  for (const t of linkedTypes) {
    const i = requiredDocs.findIndex((r, k) => !covered[k] && r === t);
    if (i >= 0) covered[i] = true;
    else generic.push(t);
  }
  for (let k = 0; k < covered.length && generic.length; k++) {
    if (!covered[k]) {
      covered[k] = true;
      generic.shift();
    }
  }
  return covered;
}

/**
 * Статус документів операції за списком прив'язаних типів.
 * Документ без типу (або "other") закриває одну будь-яку вимогу.
 */
export function computeDocStatus(requiredDocs: string[], notNeeded: boolean, linkedTypes: Array<string | null>): string {
  if (notNeeded) return "not_needed";
  if (linkedTypes.length === 0) return "missing";
  const remaining = [...requiredDocs];
  const generic: Array<string | null> = [];
  for (const t of linkedTypes) {
    const i = t ? remaining.indexOf(t) : -1;
    if (i >= 0) remaining.splice(i, 1);
    else generic.push(t);
  }
  // невідомі типи закривають те, що лишилось
  for (let k = 0; k < generic.length && remaining.length; k++) remaining.shift();
  return remaining.length === 0 ? "complete" : "partial";
}

/** Перерахувати статус операції після прив'язки/відв'язки документа. */
export async function recomputeTransaction(txId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    include: { links: { include: { document: { select: { docType: true } } } } },
  });
  if (!tx) return null;
  const notNeeded = tx.docStatusManual ? tx.docStatus === "not_needed" : tx.requiredDocs.length === 0;
  const status = computeDocStatus(
    tx.requiredDocs,
    notNeeded,
    tx.links.map((l) => l.document.docType)
  );
  if (status !== tx.docStatus) {
    await prisma.transaction.update({ where: { id: txId }, data: { docStatus: status } });
  }
  // закрити відкриті запити бухгалтера, якщо все є
  if (status === "complete") {
    const lastDoc = tx.links.length ? tx.links[tx.links.length - 1].documentId : null;
    await prisma.documentRequest.updateMany({
      where: { transactionId: txId, status: "open" },
      data: { status: "fulfilled", fulfilledAt: new Date(), fulfilledById: lastDoc },
    });
  }
  return status;
}
