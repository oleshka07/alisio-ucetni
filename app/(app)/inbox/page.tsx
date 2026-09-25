export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { findCandidates } from "@/lib/docs/match";
import { fmtAmount, fmtDate } from "@/lib/format";
import { docTypeLabel } from "@/lib/docs/types";
import FileDrop from "@/components/finance/FileDrop";
import ActionButton from "@/components/finance/ActionButton";
import DocTypeSelect from "@/components/finance/DocTypeSelect";
import { FileText, Link2, Mail, Send, Upload } from "lucide-react";

const SOURCE_ICON = { email: Mail, telegram: Send, web: Upload, accountant: Upload } as const;

export default async function InboxPage() {
  const docs = await prisma.document.findMany({
    where: { links: { none: {} }, task: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { client: true },
  });
  const withCandidates = await Promise.all(docs.map(async (d) => ({ doc: d, candidates: await findCandidates(d, 3) })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nepřiřazené doklady</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Doklady, ke kterým zatím není platba. Jakmile přijde výpis, systém je přiřadí sám — nebo je přiřaďte ručně.
        </p>
      </div>

      <FileDrop url="/api/documents/intake" compact label="Nahrát doklady (PDF, foto)" />

      {withCandidates.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-sm text-muted-foreground">Vše je přiřazeno 🎉</div>
      ) : (
        <div className="space-y-3">
          {withCandidates.map(({ doc, candidates }) => {
            const Icon = SOURCE_ICON[(doc.source || "web") as keyof typeof SOURCE_ICON] || FileText;
            return (
              <div key={doc.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground mt-1" />
                  <div className="flex-1 min-w-0">
                    <a href={`/api/documents/${doc.id}/file`} target="_blank" className="font-medium hover:text-primary truncate block">
                      {doc.originalName}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {[
                        docTypeLabel(doc.docType),
                        doc.extractedCounterparty,
                        doc.extractedNumber && `č. ${doc.extractedNumber}`,
                        doc.extractedAmount != null && `${Number(doc.extractedAmount).toLocaleString("cs-CZ")} ${doc.extractedCurrency || ""}`,
                        doc.extractedDate && fmtDate(doc.extractedDate),
                        doc.extractedVs && `VS ${doc.extractedVs}`,
                        doc.client?.name,
                        `nahráno ${fmtDate(doc.createdAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {doc.aiStatus === "failed" && <p className="text-xs text-amber-600 mt-1">Doklad se nepodařilo rozpoznat — přiřaďte ručně z detailu platby.</p>}
                  </div>
                  <DocTypeSelect documentId={doc.id} value={doc.docType || ""} />
                </div>
                {candidates.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Možné platby:</p>
                    {candidates.map((c) => (
                      <div key={c.tx.id} className="flex items-center gap-2 text-sm">
                        <ActionButton url={`/api/transactions/${c.tx.id}/link`} body={{ documentId: doc.id }} className="px-2 py-1 text-xs" success="Přiřazeno">
                          <Link2 className="w-3.5 h-3.5" /> Přiřadit
                        </ActionButton>
                        <span className="tabular-nums font-medium">{fmtAmount(Number(c.tx.amount), c.tx.currency)}</span>
                        <span className="text-muted-foreground">{fmtDate(c.tx.bookingDate)}</span>
                        <span className="truncate">{c.tx.counterpartyName || c.tx.message}</span>
                        <span className="text-xs text-muted-foreground">({c.reasons.join(", ")})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
