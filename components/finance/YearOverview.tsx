import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtAmount } from "@/lib/format";
import { buildOverview, EXCLUDED_CATEGORIES } from "@/lib/finance/overview";
import { cn } from "@/lib/utils";

const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
// kategorická paleta (dataviz): slot 1 — příjmy, slot 2 — výdaje
const INCOME = "#2a78d6";
const EXPENSE = "#eb6834";

const money = (n: number, cur: string) => fmtAmount(n, cur, false);

/**
 * Příjmy a výdaje firmy za rok: měsíce, kolik je doloženo doklady, odhad do konce roku
 * a faktury, které ještě nemají platbu (mohou chybět ve výdajích / příjmech).
 */
export default async function YearOverview({ year, clientId, query }: { year: number; clientId: string | null; query: Record<string, string> }) {
  const clients = await prisma.client.findMany({ where: { isActive: true, type: "company" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const firmId = clientId && clients.some((c) => c.id === clientId) ? clientId : clients[0]?.id ?? null;
  if (!firmId) return null;

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [txs, unpaidDocs, years] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId: firmId, bookingDate: { gte: from, lt: to } },
      select: { bookingDate: true, amount: true, currency: true, category: true, docStatus: true },
    }),
    prisma.document.findMany({
      where: {
        clientId: firmId, links: { none: {} }, archivedAt: null, companyDoc: false,
        docType: { in: ["invoice_in", "invoice_out", "receipt"] }, extractedAmount: { not: null },
        extractedDate: { gte: from, lt: to },
      },
      select: { docType: true, extractedAmount: true, extractedCurrency: true },
    }),
    prisma.transaction.findFirst({ where: { clientId: firmId }, orderBy: { bookingDate: "asc" }, select: { bookingDate: true } }),
  ]);
  const overview = buildOverview(txs.map((t) => ({ ...t, amount: Number(t.amount) })), year);

  const unpaid = new Map<string, { in: number; out: number; count: number }>();
  for (const d of unpaidDocs) {
    const cur = (d.extractedCurrency || "CZK").toUpperCase();
    const u = unpaid.get(cur) ?? { in: 0, out: 0, count: 0 };
    if (d.docType === "invoice_out") u.in += Number(d.extractedAmount);
    else u.out += Number(d.extractedAmount);
    u.count++;
    unpaid.set(cur, u);
  }

  const now = new Date();
  const firstYear = years?.bookingDate.getUTCFullYear() ?? now.getUTCFullYear();
  const yearOptions = Array.from({ length: Math.max(1, now.getUTCFullYear() - firstYear + 1) }, (_, i) => now.getUTCFullYear() - i);
  const href = (patch: Record<string, string>) => `/dashboard?${new URLSearchParams({ ...query, ...patch }).toString()}`;
  const txHref = (month?: number) =>
    `/transactions?${new URLSearchParams({ clientId: firmId, status: "all", ...(month != null ? { month: `${year}-${String(month + 1).padStart(2, "0")}` } : {}) }).toString()}`;

  return (
    <section className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Příjmy a výdaje</h2>
          <p className="text-xs text-muted-foreground">Z plateb na účtech a ručních plateb. Bez převodů mezi vlastními účty a výběrů / vkladů hotovosti.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-sm">
          {clients.map((c) => (
            <Link key={c.id} href={href({ firm: c.id })} className={cn("px-2.5 py-1 rounded-md border", c.id === firmId ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
              {c.name}
            </Link>
          ))}
          <span className="w-px bg-border mx-1" />
          {yearOptions.map((y) => (
            <Link key={y} href={href({ year: String(y) })} className={cn("px-2.5 py-1 rounded-md border", y === year ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
              {y}
            </Link>
          ))}
        </div>
      </div>

      {overview.length === 0 && <p className="text-sm text-muted-foreground">Za {year} zatím žádné platby.</p>}

      {overview.map((o) => {
        const max = Math.max(1, ...o.months.map((m) => Math.max(m.income, m.expense)));
        const docIncome = o.total.income ? Math.round(((o.total.income - o.total.incomeUndocumented) / o.total.income) * 100) : 100;
        const docExpense = o.total.expense ? Math.round(((o.total.expense - o.total.expenseUndocumented) / o.total.expense) * 100) : 100;
        const u = unpaid.get(o.currency);
        return (
          <div key={o.currency} className="space-y-4">
            {overview.length > 1 && <h3 className="text-sm font-semibold text-muted-foreground">{o.currency}</h3>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label={`Příjmy ${year}`} value={money(o.total.income, o.currency)} note={`doloženo ${docIncome} %`} swatch={INCOME} />
              <Tile label={`Výdaje ${year}`} value={money(o.total.expense, o.currency)} note={`doloženo ${docExpense} %${o.total.tax ? ` · z toho daně ${money(o.total.tax, o.currency)}` : ""}`} swatch={EXPENSE} />
              <Tile label="Výsledek" value={fmtAmount(o.result, o.currency)} note="příjmy − výdaje" />
              {o.projection ? (
                <Tile
                  label={`Odhad za celý ${year}`}
                  value={fmtAmount(o.projection.result, o.currency)}
                  note={`příjmy ${money(o.projection.income, o.currency)} · výdaje ${money(o.projection.expense, o.currency)} (průměr ${o.projection.monthsCounted} měs.)`}
                />
              ) : (
                <Tile label="Bez dokladu" value={String(o.total.undocumentedCount)} note="plateb" />
              )}
            </div>

            {(o.total.undocumentedCount > 0 || u) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm space-y-0.5">
                {o.total.undocumentedCount > 0 && (
                  <p>
                    <Link href={`/transactions?${new URLSearchParams({ clientId: firmId, status: "open" }).toString()}`} className="font-medium underline">
                      {o.total.undocumentedCount} plateb bez dokladu
                    </Link>
                    {" "}— příjmy {money(o.total.incomeUndocumented, o.currency)}, výdaje {money(o.total.expenseUndocumented, o.currency)}.
                  </p>
                )}
                {u && (
                  <p>
                    <Link href="/inbox" className="font-medium underline">{u.count} faktur bez platby</Link>
                    {" "}({u.out ? `přijaté ${money(u.out, o.currency)}` : ""}{u.out && u.in ? ", " : ""}{u.in ? `vydané ${money(u.in, o.currency)}` : ""}) — placeno kartou / hotově, nebo ještě nezaplaceno? Bez platby nejsou ve výdajích výše.
                  </p>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-1.5 pr-3">Měsíc</th>
                    <th className="text-right font-medium py-1.5 px-3">Příjmy</th>
                    <th className="text-right font-medium py-1.5 px-3">Výdaje</th>
                    <th className="text-right font-medium py-1.5 px-3">Výsledek</th>
                    <th className="text-left font-medium py-1.5 pl-3 w-[34%] hidden sm:table-cell">
                      <span className="inline-flex items-center gap-3">
                        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: INCOME }} />příjmy</span>
                        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: EXPENSE }} />výdaje</span>
                      </span>
                    </th>
                    <th className="text-right font-medium py-1.5 pl-3">Bez dokladu</th>
                  </tr>
                </thead>
                <tbody>
                  {o.months.map((m, i) => {
                    if (!m.income && !m.expense) return null;
                    const res = m.income - m.expense;
                    return (
                      <tr key={i} className="border-b border-border/60 hover:bg-accent/40">
                        <td className="py-1.5 pr-3"><Link href={txHref(i)} className="hover:text-primary">{MONTHS[i]}</Link></td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(m.income, o.currency)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(m.expense, o.currency)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-medium">{fmtAmount(res, o.currency)}</td>
                        <td className="py-1.5 pl-3 hidden sm:table-cell">
                          <div className="space-y-[2px]" title={`${MONTHS[i]}: příjmy ${money(m.income, o.currency)}, výdaje ${money(m.expense, o.currency)}`}>
                            <div className="h-1.5 rounded-r" style={{ width: `${(m.income / max) * 100}%`, background: INCOME, minWidth: m.income ? 2 : 0 }} />
                            <div className="h-1.5 rounded-r" style={{ width: `${(m.expense / max) * 100}%`, background: EXPENSE, minWidth: m.expense ? 2 : 0 }} />
                          </div>
                        </td>
                        <td className="py-1.5 pl-3 text-right">
                          {m.undocumentedCount ? (
                            <Link href={`/transactions?${new URLSearchParams({ clientId: firmId, status: "open", month: `${year}-${String(i + 1).padStart(2, "0")}` }).toString()}`} className="text-amber-700 hover:underline">
                              {m.undocumentedCount}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3"><Link href={txHref()} className="hover:text-primary">Celkem</Link></td>
                    <td className="py-2 px-3 text-right tabular-nums">{money(o.total.income, o.currency)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{money(o.total.expense, o.currency)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtAmount(o.result, o.currency)}</td>
                    <td className="hidden sm:table-cell" />
                    <td className="py-2 pl-3 text-right">{o.total.undocumentedCount || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Orientační přehled z bankovních pohybů, ne účetní výkaz. Nezahrnuto: {EXCLUDED_CATEGORIES.length === 2 ? "převody mezi vlastními účty, hotovost z/na bankomat" : EXCLUDED_CATEGORIES.join(", ")}. Měny se nepřepočítávají.
      </p>
    </section>
  );
}

function Tile({ label, value, note, swatch }: { label: string; value: string; note?: string; swatch?: string }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        {swatch && <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: swatch }} />}
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}
