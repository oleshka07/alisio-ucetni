export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { checkContinuity, monthGaps } from "@/lib/review/continuity";
import { cashSummary } from "@/lib/review/cash";
import ReviewWorkspace, { type ReviewAccount, type ReviewTx, type ReviewDoc } from "@/components/review/ReviewWorkspace";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Kontrola měsíce: firma + měsíc → všechny výpisy a platby s doklady na jedné obrazovce,
 * vlevo seznam, vpravo náhled dokladu / výpisu. Pro účetní (a majitele).
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session || session.role === "client") redirect("/login");
  const sp = await searchParams;
  const now = new Date();
  const prevMonth = shift(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, -1);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : prevMonth;
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));

  const firms = await prisma.client.findMany({ where: { isActive: true, type: "company" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const firmId = sp.firm && firms.some((f) => f.id === sp.firm) ? sp.firm : firms[0]?.id;
  if (!firmId) return <p className="text-sm text-muted-foreground">Zatím žádná firma.</p>;

  const [accounts, txs, unassigned, cashRows] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { clientId: firmId },
      orderBy: { createdAt: "asc" },
      include: { statements: { orderBy: { periodFrom: "asc" } } },
    }),
    prisma.transaction.findMany({
      where: { clientId: firmId, bookingDate: { gte: from, lt: to } },
      orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
      include: { links: { include: { document: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.document.findMany({
      where: {
        links: { none: {} }, archivedAt: null, companyDoc: false,
        OR: [{ clientId: firmId }, { clientId: null }],
        AND: [{ OR: [{ extractedDate: { gte: new Date(from.getTime() - 45 * 86400_000), lt: new Date(to.getTime() + 15 * 86400_000) } }, { extractedDate: null }] }],
      },
      orderBy: { extractedDate: "asc" },
      take: 60,
    }),
    prisma.transaction.findMany({
      where: { clientId: firmId, bookingDate: { lt: to }, OR: [{ category: "cash" }, { paymentMethod: "cash" }] },
      select: { bookingDate: true, amount: true, currency: true, category: true, paymentMethod: true },
    }),
  ]);
  const cash = cashSummary(cashRows.map((r) => ({ ...r, amount: Number(r.amount) })), from, to);

  const docOut = (d: (typeof unassigned)[number]): ReviewDoc => ({
    id: d.id, name: d.originalName, mime: d.mimeType || "", docType: d.docType,
    amount: d.extractedAmount != null ? Number(d.extractedAmount) : null, currency: d.extractedCurrency,
    date: d.extractedDate?.toISOString().slice(0, 10) ?? null, counterparty: d.extractedCounterparty,
  });

  const accountsOut: ReviewAccount[] = accounts
    .filter((a) => a.isActive || txs.some((t) => t.bankAccountId === a.id))
    .map((a) => {
      const sts = a.statements.map((s) => ({
        id: s.id, periodFrom: s.periodFrom, periodTo: s.periodTo,
        openingBalance: s.openingBalance != null ? Number(s.openingBalance) : null,
        closingBalance: s.closingBalance != null ? Number(s.closingBalance) : null,
      }));
      const inMonth = a.statements.filter((s) => s.periodFrom && s.periodTo && s.periodTo >= from && s.periodFrom < to);
      const inMonthIds = new Set(inMonth.map((s) => s.id));
      const issues = checkContinuity(sts).filter((i) => inMonthIds.has(i.afterId) || inMonthIds.has(i.beforeId));
      return {
        id: a.id, name: a.name, currency: a.currency, number: a.accountNumber || a.iban,
        statements: inMonth.map((s) => ({
          id: s.id, fileName: s.fileName, hasFile: !!s.fileUrl,
          periodFrom: s.periodFrom?.toISOString().slice(0, 10) ?? null, periodTo: s.periodTo?.toISOString().slice(0, 10) ?? null,
          opening: s.openingBalance != null ? Number(s.openingBalance) : null, closing: s.closingBalance != null ? Number(s.closingBalance) : null,
          isPdf: /\.pdf$/i.test(s.fileName || "") || /\.pdf$/i.test(s.fileUrl || ""),
        })),
        gaps: a.source === "fio_api" ? [] : monthGaps(sts, month),
        issues: issues.map((i) =>
          i.kind === "gap" ? `Chybí výpis ${i.from} – ${i.to}` : `Zůstatek nenavazuje: konečný ${i.closing} ≠ počáteční ${i.opening}`
        ),
      };
    });

  const txOut: ReviewTx[] = txs.map((t) => ({
    id: t.id, accountId: t.bankAccountId, date: t.bookingDate.toISOString().slice(0, 10), amount: Number(t.amount), currency: t.currency,
    counterparty: t.counterpartyName || t.counterpartyAccount, message: t.message, vs: t.variableSymbol,
    docStatus: t.docStatus, reviewed: !!t.reviewedAt, method: t.paymentMethod, hint: t.docHint,
    docs: t.links.map((l) => docOut(l.document)),
  }));

  const q = (patch: Record<string, string>) => `/review?${new URLSearchParams({ firm: firmId, month, ...patch }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kontrola měsíce</h1>
          <p className="text-sm text-muted-foreground">Výpisy, platby a doklady firmy za měsíc na jednom místě. ↑ ↓ — další platba, Enter — zkontrolováno a dál.</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={q({ month: shift(month, -1) })} className="p-1.5 rounded-md border border-border hover:bg-accent" aria-label="Předchozí měsíc"><ChevronLeft className="w-4 h-4" /></Link>
          <span className="px-3 font-medium capitalize min-w-[9rem] text-center">{MONTHS[m - 1]} {y}</span>
          <Link href={q({ month: shift(month, 1) })} className="p-1.5 rounded-md border border-border hover:bg-accent" aria-label="Další měsíc"><ChevronRight className="w-4 h-4" /></Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {firms.map((f) => (
          <Link key={f.id} href={q({ firm: f.id })} className={cn("px-2.5 py-1 rounded-md border", f.id === firmId ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
            {f.name}
          </Link>
        ))}
      </div>
      <ReviewWorkspace key={`${firmId}-${month}`} accounts={accountsOut} txs={txOut} unassigned={unassigned.map(docOut)} cash={cash} />
    </div>
  );
}
