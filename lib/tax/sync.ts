import type { CompanyProfile, Client } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAccount } from "@/lib/docs/rules";
import { generateDeadlines, taxAccountPrefix, PREFIX_KINDS, type TaxSettings } from "./calendar";

const DAY = 86400_000;

/** Nastavení kalendáře z profilu firmy (null = kalendář vypnutý / chybí profil). */
export function settingsFromProfile(client: Pick<Client, "type">, p: CompanyProfile | null): TaxSettings | null {
  if (!p || !p.taxCalendar) return null;
  const osvc = p.taxEntity ? p.taxEntity === "osvc" : client.type === "person" || /osvč|osvc|fyzick/i.test(p.legalForm || "");
  const pick = <T extends string>(v: string, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
  return {
    entity: osvc ? "osvc" : "legal",
    vatPayer: p.vatPayer,
    vatPeriod: p.vatPeriod === "quarterly" ? "quarterly" : "monthly",
    euSupplies: p.euSupplies,
    hasEmployees: p.hasEmployees,
    hasWithholding: p.hasWithholding,
    incomeTaxFiling: pick(p.incomeTaxFiling, ["standard", "electronic", "advisor"] as const, "standard"),
    incomeTaxAdvances: pick(p.incomeTaxAdvances, ["none", "half", "quarter"] as const, "none"),
    flatTax: osvc && p.flatTax,
    roadTaxVehicles: p.roadTaxVehicles,
    ownsRealEstate: p.ownsRealEstate,
    propertyTaxSplit: p.propertyTaxSplit,
  };
}

const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

/**
 * Vygeneruje / aktualizuje automatické termíny firmy na období [dnes − 60 dní, dnes + 120 dní].
 * Nové termíny vytváří jen od dneška; splněné a zaplacené nemění; nesplněné automatické termíny,
 * které po změně nastavení už neplatí, smaže.
 */
export async function syncTaxCalendar(clientId?: string) {
  const clients = await prisma.client.findMany({
    where: { isActive: true, ...(clientId ? { id: clientId } : {}) },
    include: { companyProfile: true },
  });
  const from = new Date(today().getTime() - 60 * DAY);
  const to = new Date(today().getTime() + 120 * DAY);
  let created = 0, updated = 0, removed = 0;

  for (const c of clients) {
    const settings = settingsFromProfile(c, c.companyProfile);
    const deadlines = settings ? generateDeadlines(settings, from, to) : [];
    const keys = new Set(deadlines.map((d) => d.key));

    for (const d of deadlines) {
      const existing = await prisma.taxEvent.findUnique({ where: { clientId_key: { clientId: c.id, key: d.key } } });
      const data = {
        title: d.title,
        kind: d.kind,
        dueDate: d.dueDate,
        period: d.period,
        files: d.files,
        pays: d.pays,
        accountPrefix: d.accountPrefix ?? null,
        note: d.note ?? null,
        eventType: d.pays ? "tax_payment" : "report",
      };
      if (!existing) {
        // nové termíny jen od dneška: při prvním nastavení nebo změně profilu nevytvářet „po termínu“ zpětně
        if (d.dueDate < today()) continue;
        await prisma.taxEvent.create({ data: { ...data, clientId: c.id, key: d.key, source: "auto", status: "upcoming" } });
        created++;
      } else if (existing.status === "upcoming" && (existing.dueDate.getTime() !== d.dueDate.getTime() || existing.title !== d.title || existing.note !== data.note)) {
        await prisma.taxEvent.update({ where: { id: existing.id }, data });
        updated++;
      }
    }
    // nastavení se změnilo → nesplněné automatické termíny v okně, které už neplatí
    const stale = await prisma.taxEvent.deleteMany({
      where: { clientId: c.id, source: "auto", status: "upcoming", dueDate: { gte: from }, key: { notIn: [...keys] } },
    });
    removed += stale.count;
  }
  const matched = await matchTaxPayments(clientId);
  return { clients: clients.length, created, updated, removed, matched };
}

/**
 * Platba na účet FÚ (předčíslí-matrika/0710) s VS = DIČ firmy → nejbližší nezaplacený termín
 * daného druhu se označí jako zaplacený. Okno: splatnost 25 dní před až 20 dní po platbě
 * (daně se platí krátce před termínem; dřívější platba by se přiřadila k dalšímu období).
 */
export async function matchTaxPayments(clientId?: string): Promise<number> {
  const since = new Date(Date.now() - 150 * DAY);
  const txs = await prisma.transaction.findMany({
    where: { amount: { lt: 0 }, bookingDate: { gte: since }, counterpartyAccount: { not: null }, ...(clientId ? { clientId } : {}) },
    include: { client: { include: { companyProfile: true } } },
  });
  const used = new Set(
    (await prisma.taxEvent.findMany({ where: { paidTransactionId: { not: null } }, select: { paidTransactionId: true } })).map((e) => e.paidTransactionId!)
  );
  let matched = 0;
  for (const tx of txs) {
    if (used.has(tx.id)) continue;
    const prefix = taxAccountPrefix(normalizeAccount(tx.counterpartyAccount));
    if (!prefix) continue;
    const dic = (tx.client.companyProfile?.dic || "").replace(/\D/g, "");
    if (dic && tx.variableSymbol && tx.variableSymbol.replace(/^0+/, "") !== dic.replace(/^0+/, "")) continue;
    const ev = await prisma.taxEvent.findFirst({
      where: {
        clientId: tx.clientId,
        pays: true,
        status: "upcoming",
        kind: { in: PREFIX_KINDS[prefix] },
        dueDate: { gte: new Date(tx.bookingDate.getTime() - 25 * DAY), lte: new Date(tx.bookingDate.getTime() + 20 * DAY) },
      },
      orderBy: { dueDate: "asc" },
    });
    if (!ev) continue;
    await prisma.taxEvent.update({
      where: { id: ev.id },
      data: { status: "paid", paidTransactionId: tx.id, doneAt: new Date(), amount: Math.abs(Number(tx.amount)) },
    });
    used.add(tx.id);
    matched++;
  }
  return matched;
}
