export const dynamic = "force-dynamic";

import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { findCandidates } from "@/lib/docs/match";
import { fmtAmount, fmtDate } from "@/lib/format";
import FileDrop from "@/components/finance/FileDrop";
import ActionButton from "@/components/finance/ActionButton";
import DocTypeSelect from "@/components/finance/DocTypeSelect";
import DocEditButton from "@/components/finance/DocEditButton";
import ManualPaymentButton from "@/components/finance/ManualPaymentButton";
import BulkBar, { SelectAll } from "@/components/finance/BulkBar";
import { manualPaymentBlocker } from "@/lib/docs/manual-payment";
import { Archive, ArchiveRestore, FileText, Link2, Mail, Send, Trash2, Upload } from "lucide-react";

// причини збігу приходять українською (їх же показує Telegram-бот)
const REASON_CS: Record<string, string> = { "сума": "částka", "сума ≈": "částka ≈", "назва": "název" };

const SOURCE_ICON = { email: Mail, telegram: Send, web: Upload, accountant: Upload } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const archive = (await searchParams).view === "archive";
  const session = await getSession();
  const isOwner = session?.role === "owner";
  const [docs, archivedCount, companies] = await Promise.all([
    prisma.document.findMany({
      where: archive ? { archivedAt: { not: null }, companyDoc: false } : { links: { none: {} }, task: null, archivedAt: null, companyDoc: false },
      orderBy: archive ? { archivedAt: "desc" } : { createdAt: "desc" },
      take: archive ? 200 : 50,
      include: { client: true },
    }),
    prisma.document.count({ where: { archivedAt: { not: null }, companyDoc: false } }),
    prisma.client.findMany({ where: { isActive: true, type: "company" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const withCandidates = await Promise.all(docs.map(async (d) => ({ doc: d, candidates: archive ? [] : await findCandidates(d, 3) })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nepřiřazené doklady</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Doklady, ke kterým zatím není platba. Jakmile přijde výpis, systém je přiřadí sám — nebo je přiřaďte ručně.
        </p>
      </div>

      {!archive && <FileDrop url="/api/documents/intake" compact label="Nahrát doklady (PDF, foto)" />}

      <div className="flex gap-1 border-b border-border">
        {[
          { href: "/inbox", label: "K přiřazení", active: !archive },
          { href: "/inbox?view=archive", label: `Archiv (${archivedCount})`, active: archive },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn("px-3 py-2 text-sm border-b-2 -mb-px", t.active ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {withCandidates.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-sm text-muted-foreground">
          {archive ? "Archiv je prázdný" : "Vše je přiřazeno 🎉"}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-40" />
              <col className="w-[18%]" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-32" />
              <col className={archive ? "w-36" : "w-32"} />
            </colgroup>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="pl-4 py-2 text-left"><SelectAll /></th>
                <th className="text-left font-medium px-4 py-2">Doklad</th>
                <th className="text-left font-medium px-4 py-2">Typ</th>
                <th className="text-left font-medium px-4 py-2">Protistrana</th>
                <th className="text-left font-medium px-4 py-2">Datum</th>
                <th className="text-left font-medium px-4 py-2">VS</th>
                <th className="text-right font-medium px-4 py-2">Částka</th>
                <th className="px-2 py-2"><span className="sr-only">Akce</span></th>
              </tr>
            </thead>
            <tbody>
              {withCandidates.map(({ doc, candidates }) => {
                const Icon = SOURCE_ICON[(doc.source || "web") as keyof typeof SOURCE_ICON] || FileText;
                return (
                  <Fragment key={doc.id}>
                    <tr className="border-t border-border hover:bg-accent/50 align-top">
                      <td className="pl-4 py-3">
                        <input type="checkbox" name="docSel" value={doc.id} aria-label={`Vybrat ${doc.originalName}`} className="w-4 h-4 accent-primary" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
                          <div className="min-w-0">
                            <a href={`/api/documents/${doc.id}/file`} target="_blank" className="font-medium text-foreground hover:text-primary block truncate" title={doc.originalName}>
                              {doc.originalName}
                            </a>
                            <p className="text-xs text-muted-foreground truncate">
                              {[
                                doc.extractedNumber && `č. ${doc.extractedNumber}`,
                                doc.client?.name,
                                doc.archivedAt ? `archivováno ${fmtDate(doc.archivedAt)}` : `nahráno ${fmtDate(doc.createdAt)}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {!archive && doc.aiStatus === "failed" && <p className="text-xs text-amber-600 mt-0.5">Nerozpoznáno — přiřaďte ručně z detailu platby.</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <DocTypeSelect documentId={doc.id} value={doc.docType || ""} className="w-full" />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block truncate" title={doc.extractedCounterparty || undefined}>{doc.extractedCounterparty || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{doc.extractedDate ? fmtDate(doc.extractedDate) : "—"}</td>
                      <td className="px-4 py-2.5 truncate text-muted-foreground tabular-nums">{doc.extractedVs || "—"}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium tabular-nums">
                        {doc.extractedAmount != null ? fmtAmount(Number(doc.extractedAmount), doc.extractedCurrency || "CZK", false) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {archive ? (
                          <div className="inline-flex gap-1">
                            <ActionButton url={`/api/documents/${doc.id}`} method="PATCH" body={{ archived: false }} variant="ghost" className="px-2 text-xs" success="Obnoveno">
                              <ArchiveRestore className="w-3.5 h-3.5" /> Obnovit
                            </ActionButton>
                            {isOwner && (
                              <ActionButton url={`/api/documents/${doc.id}`} method="DELETE" variant="danger" className="px-2 text-xs" confirm={`Smazat „${doc.originalName}“ natrvalo? Soubor nepůjde obnovit.`} success="Smazáno">
                                <Trash2 className="w-3.5 h-3.5" />
                              </ActionButton>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center">
                            <DocEditButton
                              clients={companies}
                              doc={{
                                id: doc.id,
                                originalName: doc.originalName,
                                clientId: doc.clientId,
                                extractedCounterparty: doc.extractedCounterparty,
                                extractedIco: doc.extractedIco,
                                extractedNumber: doc.extractedNumber,
                                extractedDate: doc.extractedDate ? doc.extractedDate.toISOString().slice(0, 10) : null,
                                extractedAmount: doc.extractedAmount != null ? String(doc.extractedAmount) : null,
                                extractedCurrency: doc.extractedCurrency,
                                extractedVs: doc.extractedVs,
                              }}
                            />
                            <ManualPaymentButton documentId={doc.id} blocker={manualPaymentBlocker(doc)} />
                            <ActionButton url={`/api/documents/${doc.id}`} method="PATCH" body={{ archived: true }} variant="ghost" className="px-2" success="Přesunuto do archivu" title="Archivovat — zbytečný nebo omylem nahraný doklad">
                              <Archive className="w-4 h-4" />
                            </ActionButton>
                          </div>
                        )}
                      </td>
                    </tr>
                    {candidates.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={8} className="px-4 pb-2.5 pt-1">
                          <div className="pl-12 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Možné platby:</p>
                            {candidates.map((c) => (
                              <div key={c.tx.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <ActionButton url={`/api/transactions/${c.tx.id}/link`} body={{ documentId: doc.id }} className="px-2 py-1 text-xs" success="Přiřazeno">
                                  <Link2 className="w-3.5 h-3.5" /> Přiřadit
                                </ActionButton>
                                <span className="tabular-nums font-medium">{fmtAmount(Number(c.tx.amount), c.tx.currency)}</span>
                                <span className="text-muted-foreground">{fmtDate(c.tx.bookingDate)}</span>
                                <span className="truncate">{c.tx.counterpartyName || c.tx.message}</span>
                                <span className="text-xs text-muted-foreground">({c.reasons.map((r) => REASON_CS[r] || r).join(", ")})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar archive={archive} isOwner={isOwner} clients={companies} />
    </div>
  );
}
