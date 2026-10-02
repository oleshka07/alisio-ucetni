export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { fmtAmount, fmtDate } from "@/lib/format";
import FileDrop from "@/components/finance/FileDrop";
import ActionButton from "@/components/finance/ActionButton";
import { AlertTriangle, Download, ExternalLink, Trash2 } from "lucide-react";

const SOURCE: Record<string, string> = { imap: "E-mail", upload: "Ručně", fio: "Fio API" };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const { accountId } = await searchParams;
  const session = await getSession();
  const isOwner = session?.role === "owner";
  const [accounts, statements] = await Promise.all([
    prisma.bankAccount.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, isActive: true, lastSyncAt: true, lastError: true, source: true } }),
    prisma.bankStatement.findMany({
      where: accountId ? { bankAccountId: accountId } : undefined,
      orderBy: [{ periodTo: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
      include: { bankAccount: { select: { name: true, currency: true } } },
    }),
  ]);
  const problems = accounts.filter((a) => a.isActive && a.lastError);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Výpisy</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Bankovní výpisy z e-mailu i nahrané ručně. Účet se pozná z čísla účtu ve výpisu; originál je ke stažení.
        </p>
      </div>

      <FileDrop url="/api/statements/upload" compact accept=".xml,.pdf" label="Nahrát výpisy — CAMT.053 XML nebo PDF Komerční banky (lze víc souborů najednou)" />

      {problems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
          {problems.map((a) => (
            <p key={a.id} className="flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><b>{a.name}</b>: {a.lastError}</span>
            </p>
          ))}
        </div>
      )}

      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-1 text-sm">
          <Link href="/statements" className={!accountId ? "px-3 py-1 rounded-md bg-primary text-primary-foreground" : "px-3 py-1 rounded-md border border-border hover:bg-accent"}>
            Všechny účty
          </Link>
          {accounts.map((a) => (
            <Link key={a.id} href={`/statements?accountId=${a.id}`} className={accountId === a.id ? "px-3 py-1 rounded-md bg-primary text-primary-foreground" : "px-3 py-1 rounded-md border border-border hover:bg-accent"}>
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        {statements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Zatím žádné výpisy</p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Účet</th>
                <th className="text-left font-medium px-4 py-2">Období</th>
                <th className="text-right font-medium px-4 py-2">Pohyby</th>
                <th className="text-right font-medium px-4 py-2">Počáteční → konečný zůstatek</th>
                <th className="text-left font-medium px-4 py-2">Zdroj</th>
                <th className="text-left font-medium px-4 py-2">Soubor</th>
                {isOwner && <th className="px-2 py-2"><span className="sr-only">Akce</span></th>}
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const cur = s.bankAccount.currency;
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-accent/50">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{s.bankAccount.name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {s.periodFrom || s.periodTo ? `${fmtDate(s.periodFrom)} – ${fmtDate(s.periodTo)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {s.txCount}
                      {s.importedCount !== s.txCount && <span className="text-xs text-muted-foreground"> (nových {s.importedCount})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {s.openingBalance != null ? fmtAmount(Number(s.openingBalance), cur, false) : "—"} → {s.closingBalance != null ? fmtAmount(Number(s.closingBalance), cur, false) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {SOURCE[s.source] || s.source} · {fmtDate(s.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 max-w-[16rem]">
                      {s.fileUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={`/api/statements/${s.id}/file`} target="_blank" className="truncate hover:text-primary" title={s.fileName || undefined}>
                            {s.fileName || "výpis"}
                          </a>
                          <a href={`/api/statements/${s.id}/file`} target="_blank" className="text-muted-foreground hover:text-foreground" title="Otevřít"><ExternalLink className="w-3.5 h-3.5" /></a>
                          <a href={`/api/statements/${s.id}/file?download`} className="text-muted-foreground hover:text-foreground" title="Stáhnout"><Download className="w-3.5 h-3.5" /></a>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">{s.fileName ? `${s.fileName} (soubor neuložen)` : "—"}</span>
                      )}
                    </td>
                    {isOwner && (
                      <td className="px-2 py-2 text-right">
                        <ActionButton
                          url={`/api/statements/${s.id}`}
                          method="DELETE"
                          variant="ghost"
                          className="px-2"
                          title="Smazat výpis i jeho platby"
                          confirm={`Smazat výpis ${s.fileName || ""} a jeho ${s.importedCount} plateb? Doklady k nim se vrátí do „Nepřiřazené doklady“.`}
                          success="Výpis smazán"
                        >
                          <Trash2 className="w-4 h-4" />
                        </ActionButton>
                      </td>
                    )}
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
