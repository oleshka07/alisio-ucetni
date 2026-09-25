export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtDate, monthRange } from "@/lib/format";
import { CATEGORIES } from "@/lib/docs/types";
import StatusBadge from "@/components/finance/StatusBadge";
import FileDrop from "@/components/finance/FileDrop";
import ActionButton from "@/components/finance/ActionButton";
import ExportForm from "@/components/finance/ExportForm";
import { Paperclip, RefreshCw, CheckCircle2, MessageSquareWarning } from "lucide-react";

type SP = Promise<{ clientId?: string; month?: string; status?: string; q?: string }>;

const STATUS_TABS = [
  { key: "open", label: "Chybí doklady" },
  { key: "complete", label: "Kompletní" },
  { key: "not_needed", label: "Není potřeba" },
  { key: "all", label: "Vše" },
];

export default async function TransactionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = sp.status || "open";
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const clients = await prisma.client.findMany({ where: { isActive: true, type: "company" }, orderBy: { createdAt: "asc" } });

  const where: Prisma.TransactionWhereInput = {};
  if (sp.clientId) where.clientId = sp.clientId;
  if (month) {
    const { from, to } = monthRange(month);
    where.bookingDate = { gte: from, lt: to };
  }
  if (status === "open") where.docStatus = { in: ["missing", "partial"] };
  else if (status !== "all") where.docStatus = status;
  if (sp.q) {
    where.OR = [
      { counterpartyName: { contains: sp.q, mode: "insensitive" } },
      { message: { contains: sp.q, mode: "insensitive" } },
      { variableSymbol: { contains: sp.q } },
    ];
  }

  const [txs, counts, openRequests, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { bookingDate: "desc" },
      take: 300,
      include: {
        client: true,
        bankAccount: { select: { name: true } },
        _count: { select: { links: true } },
        requests: { where: { status: "open" }, select: { id: true } },
      },
    }),
    prisma.transaction.groupBy({
      by: ["docStatus"],
      where: { ...(sp.clientId ? { clientId: sp.clientId } : {}), ...(where.bookingDate ? { bookingDate: where.bookingDate } : {}) },
      _count: true,
    }),
    prisma.documentRequest.count({ where: { status: "open" } }),
    prisma.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const count = (k: string) => counts.filter((c) => (k === "open" ? ["missing", "partial"].includes(c.docStatus) : k === "all" || c.docStatus === k)).reduce((a, c) => a + c._count, 0);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { clientId: sp.clientId, month, status, q: sp.q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/transactions?${p.toString()}`;
  };
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platby a doklady</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Každá platba z výpisu a doklady k ní. {openRequests > 0 && <span className="text-amber-600">Otevřené požadavky: {openRequests}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton url="/api/cron/sync" success="Synchronizace hotová">
            <RefreshCw className="w-3.5 h-3.5" /> Načíst výpisy a e-maily
          </ActionButton>
          {clients.length > 0 && <ExportForm clients={clients} defaultClientId={sp.clientId} defaultMonth={month || thisMonth} />}
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Zatím není nastaven žádný bankovní účet. <Link href="/settings" className="underline font-medium">Nastavení → Bankovní účty</Link>
        </div>
      )}

      <section className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-medium mb-2">Nahrát doklady — systém sám najde platbu</p>
        <FileDrop url="/api/documents/intake" compact extra={sp.clientId ? { clientId: sp.clientId } : undefined} label="Faktury, účtenky, smlouvy (PDF, foto) — přetáhněte sem" />
      </section>

      <form className="flex flex-wrap items-center gap-2" action="/transactions">
        <input type="hidden" name="status" value={status} />
        <select name="clientId" defaultValue={sp.clientId || ""} className="text-sm border border-border rounded-md px-2 py-1.5 bg-background">
          <option value="">Všechny firmy</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input type="month" name="month" defaultValue={month} className="text-sm border border-border rounded-md px-2 py-1 bg-background" />
        <input name="q" defaultValue={sp.q} placeholder="Hledat protistranu, zprávu, VS…" className="text-sm border border-border rounded-md px-3 py-1.5 bg-background w-64" />
        <button className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground">Filtrovat</button>
      </form>

      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ status: t.key })}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px",
              status === t.key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label} <span className="text-xs opacity-70">({count(t.key)})</span>
          </Link>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            {status === "open" ? "Všechny platby mají doklady 🎉" : "Žádné platby"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Datum</th>
                <th className="text-left font-medium px-4 py-2">Protistrana / zpráva</th>
                <th className="text-right font-medium px-4 py-2">Částka</th>
                <th className="text-left font-medium px-4 py-2">Kategorie</th>
                <th className="text-left font-medium px-4 py-2">Doklady</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const amount = Number(tx.amount);
                return (
                  <tr key={tx.id} className="border-t border-border hover:bg-accent/50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fmtDate(tx.bookingDate)}</td>
                    <td className="px-4 py-2.5 max-w-md">
                      <Link href={`/transactions/${tx.id}`} className="font-medium text-foreground hover:text-primary block truncate">
                        {tx.counterpartyName || tx.message || tx.counterpartyAccount || "—"}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {[tx.counterpartyName && tx.message, tx.variableSymbol && `VS ${tx.variableSymbol}`, clients.length > 1 && tx.client.name, tx.bankAccount?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className={cn("px-4 py-2.5 text-right whitespace-nowrap font-medium tabular-nums", amount > 0 ? "text-emerald-600" : "text-foreground")}>
                      {fmtAmount(amount, tx.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{CATEGORIES[tx.category || ""] || "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={tx.docStatus} />
                        {tx._count.links > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Paperclip className="w-3 h-3" />{tx._count.links}</span>
                        )}
                        {tx.requests.length > 0 && <MessageSquareWarning className="w-3.5 h-3.5 text-amber-500" aria-label="Požadavek účetní" />}
                        {tx.reviewedAt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-label="Zkontrolováno" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
