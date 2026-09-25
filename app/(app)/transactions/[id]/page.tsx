export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtDate } from "@/lib/format";
import { CATEGORIES, DOC_TYPES, docTypeLabel } from "@/lib/docs/types";
import { requirementCoverage } from "@/lib/docs/rules";
import StatusBadge from "@/components/finance/StatusBadge";
import FileDrop from "@/components/finance/FileDrop";
import ActionButton from "@/components/finance/ActionButton";
import RequestForm from "@/components/finance/RequestForm";
import { ArrowLeft, FileText, ExternalLink, Unlink, Link2, Lightbulb, CheckCircle2, Clock } from "lucide-react";

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      client: true,
      bankAccount: true,
      links: { include: { document: true }, orderBy: { createdAt: "asc" } },
      requests: { include: { requestedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!tx) notFound();

  const amount = Number(tx.amount);
  const linkedTypes = tx.links.map((l) => l.document.docType);
  const coverage = requirementCoverage(tx.requiredDocs, linkedTypes);
  const unassigned = await prisma.document.findMany({
    where: { links: { none: {} }, OR: [{ clientId: tx.clientId }, { clientId: null }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Platby
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{fmtDate(tx.bookingDate)} · {tx.client.name}{tx.bankAccount ? ` · ${tx.bankAccount.name}` : ""}</p>
          <h1 className={cn("text-3xl font-bold tabular-nums", amount > 0 ? "text-emerald-600" : "text-foreground")}>{fmtAmount(amount, tx.currency)}</h1>
          <p className="text-lg font-medium mt-1">{tx.counterpartyName || tx.counterpartyAccount || "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={tx.docStatus} className="text-sm px-3 py-1" />
          {tx.reviewedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Zkontrolováno {fmtDate(tx.reviewedAt)}</span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Požadované doklady */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Doklady k platbě</h2>
            {tx.docHint && (
              <div className="flex gap-2 text-sm bg-sky-50 border border-sky-100 text-sky-800 rounded-lg p-3">
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" /> <span>{tx.docHint}</span>
              </div>
            )}
            {tx.docStatus !== "not_needed" && tx.requiredDocs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tx.requiredDocs.map((t, i) => {
                  const have = coverage[i];
                  return (
                    <span key={i} className={cn("text-xs px-2 py-1 rounded-md border", have ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700")}>
                      {have ? "✓" : "✗"} {docTypeLabel(t)}
                    </span>
                  );
                })}
              </div>
            )}

            {tx.links.length > 0 && (
              <ul className="divide-y divide-border border border-border rounded-lg">
                {tx.links.map((l) => (
                  <li key={l.documentId} className="flex items-center gap-3 px-3 py-2.5">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <a href={`/api/documents/${l.documentId}/file`} target="_blank" className="text-sm font-medium hover:text-primary truncate block">
                        {l.document.originalName}
                      </a>
                      <p className="text-xs text-muted-foreground truncate">
                        {docTypeLabel(l.document.docType)}
                        {l.document.extractedNumber && ` č. ${l.document.extractedNumber}`}
                        {l.document.extractedAmount != null && ` · ${Number(l.document.extractedAmount).toLocaleString("cs-CZ")} ${l.document.extractedCurrency || ""}`}
                        {` · nahráno ${fmtDate(l.createdAt)} (${l.linkedBy})`}
                      </p>
                    </div>
                    <a href={`/api/documents/${l.documentId}/file`} target="_blank" className="p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="w-4 h-4" /></a>
                    <ActionButton url={`/api/transactions/${tx.id}/documents?documentId=${l.documentId}`} method="DELETE" variant="ghost" confirm="Odpojit doklad od platby?" className="px-1.5">
                      <Unlink className="w-4 h-4" />
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}

            <FileDrop url={`/api/transactions/${tx.id}/documents`} withDocType defaultDocType={tx.requiredDocs.find((t, i) => !coverage[i] && t !== "other") || ""} label="Nahrát doklad k této platbě" />

            {unassigned.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Přiřadit už nahraný doklad ({unassigned.length})</summary>
                <ul className="mt-2 space-y-1">
                  {unassigned.map((d) => (
                    <li key={d.id} className="flex items-center gap-2">
                      <ActionButton url={`/api/transactions/${tx.id}/link`} body={{ documentId: d.id }} variant="ghost" className="px-1.5" success="Přiřazeno">
                        <Link2 className="w-3.5 h-3.5" />
                      </ActionButton>
                      <a href={`/api/documents/${d.id}/file`} target="_blank" className="truncate hover:text-primary">{d.originalName}</a>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {d.extractedAmount != null ? `${Number(d.extractedAmount).toLocaleString("cs-CZ")} ${d.extractedCurrency || ""}` : ""} {fmtDate(d.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* Požadavky účetní */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Požadavek na doklad</h2>
            <RequestForm transactionId={tx.id} defaultDocType={tx.requiredDocs.find((t, i) => t !== "other" && !coverage[i])} />
            {tx.requests.length > 0 && (
              <ul className="space-y-2">
                {tx.requests.map((r) => (
                  <li key={r.id} className="text-sm border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", r.status === "open" ? "bg-amber-100 text-amber-700" : r.status === "fulfilled" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                        {r.status === "open" ? "Otevřený" : r.status === "fulfilled" ? "Splněno" : "Zrušeno"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.requestedBy?.name || "—"} · {fmtDate(r.createdAt)}
                        {r.remindCount > 0 && ` · připomenuto ${r.remindCount}×`}
                      </span>
                    </div>
                    <p className="mt-1.5">{r.message}</p>
                    {r.status === "open" && (
                      <div className="mt-2 flex gap-2">
                        <ActionButton url={`/api/requests/${r.id}`} method="PATCH" body={{ status: "fulfilled" }} className="text-xs px-2 py-1">Splněno</ActionButton>
                        <ActionButton url={`/api/requests/${r.id}`} method="PATCH" body={{ status: "cancelled" }} variant="ghost" className="text-xs px-2 py-1">Zrušit</ActionButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Detail platby + akce */}
        <aside className="space-y-4">
          <section className="bg-card border border-border rounded-xl p-5 text-sm space-y-2">
            <Row k="Protiúčet" v={tx.counterpartyAccount} />
            <Row k="VS" v={tx.variableSymbol} />
            <Row k="KS" v={tx.constantSymbol} />
            <Row k="SS" v={tx.specificSymbol} />
            <Row k="Zpráva" v={tx.message} />
            <Row k="Kategorie" v={CATEGORIES[tx.category || ""] || tx.category} />
            <Row k="Požadováno" v={tx.requiredDocs.map((t) => (DOC_TYPES as Record<string, { cs: string }>)[t]?.cs || t).join(", ") || "—"} />
          </section>
          <section className="bg-card border border-border rounded-xl p-5 space-y-2">
            {tx.docStatus === "not_needed" ? (
              <ActionButton url={`/api/transactions/${tx.id}`} method="PATCH" body={{ action: "needed" }} className="w-full justify-center">Doklad je potřeba</ActionButton>
            ) : (
              <ActionButton url={`/api/transactions/${tx.id}`} method="PATCH" body={{ action: "not_needed" }} className="w-full justify-center">Doklad není potřeba</ActionButton>
            )}
            {session?.role === "accountant" || session?.role === "owner" ? (
              tx.reviewedAt ? (
                <ActionButton url={`/api/transactions/${tx.id}`} method="PATCH" body={{ action: "unreviewed" }} variant="ghost" className="w-full justify-center">Zrušit kontrolu</ActionButton>
              ) : (
                <ActionButton url={`/api/transactions/${tx.id}`} method="PATCH" body={{ action: "reviewed" }} variant="primary" className="w-full justify-center">
                  <CheckCircle2 className="w-4 h-4" /> Zkontrolováno
                </ActionButton>
              )
            ) : null}
            {["missing", "partial"].includes(tx.docStatus) && (
              <ActionButton url={`/api/transactions/${tx.id}`} method="PATCH" body={{ action: "snooze", days: 7 }} variant="ghost" className="w-full justify-center" success="Připomenutí odloženo o 7 dní">
                <Clock className="w-4 h-4" /> Odložit připomínky o 7 dní
              </ActionButton>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="text-right break-words min-w-0">{v || "—"}</span>
    </div>
  );
}
