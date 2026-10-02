export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cn, formatFileSize } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { COMPANY_DOC_CATEGORIES, companyDocCategoryLabel } from "@/lib/docs/company-docs";
import CompanyDocUpload from "@/components/finance/CompanyDocUpload";
import ActionButton from "@/components/finance/ActionButton";
import { Archive, ArchiveRestore, Download, ExternalLink, FileText } from "lucide-react";

type SP = Promise<{ clientId?: string; category?: string; archived?: string }>;

/** Firemní dokumenty: výpis z rejstříku, stanovy, licence, smlouvy… (ne faktury k platbám). */
export default async function DocumentsPage({ searchParams }: { searchParams: SP }) {
  const { clientId, category, archived } = await searchParams;
  const showArchived = archived === "1";
  const session = await getSession();
  const [docs, companies] = await Promise.all([
    prisma.document.findMany({
      where: { companyDoc: true, archivedAt: showArchived ? { not: null } : null, ...(clientId ? { clientId } : {}), ...(category ? { docCategory: category } : {}) },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ docCategory: "asc" }, { createdAt: "desc" }],
    }),
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const soon = new Date(Date.now() + 30 * 86400_000);
  const now = new Date();
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ clientId, category, archived, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/documents?${s}` : "/documents";
  };
  const chip = (active: boolean) => (active ? "px-3 py-1 rounded-md bg-primary text-primary-foreground" : "px-3 py-1 rounded-md border border-border hover:bg-accent");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dokumenty firmy</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Výpis z rejstříku, stanovy, licence, smlouvy a další důležité dokumenty. Faktury a účtenky patří do „Nepřiřazené doklady“.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-1 text-sm">
            {companies.length > 1 && (
              <>
                <Link href={qs({ clientId: undefined })} className={chip(!clientId)}>Všechny firmy</Link>
                {companies.map((c) => <Link key={c.id} href={qs({ clientId: c.id })} className={chip(clientId === c.id)}>{c.name}</Link>)}
                <span className="w-full" />
              </>
            )}
            <Link href={qs({ category: undefined })} className={chip(!category)}>Vše</Link>
            {Object.entries(COMPANY_DOC_CATEGORIES).map(([k, v]) => (
              <Link key={k} href={qs({ category: k })} className={chip(category === k)}>{v.split(/[ ,/]/)[0]}</Link>
            ))}
            <Link href={qs({ archived: showArchived ? undefined : "1" })} className={cn(chip(showArchived), "ml-auto")}>Archiv</Link>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            {docs.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Zatím žádné dokumenty</p>
              </div>
            ) : (
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Dokument</th>
                    <th className="text-left font-medium px-4 py-2">Kategorie</th>
                    {companies.length > 1 && <th className="text-left font-medium px-4 py-2">Firma</th>}
                    <th className="text-left font-medium px-4 py-2">Platnost do</th>
                    <th className="px-2 py-2"><span className="sr-only">Akce</span></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => {
                    const expired = d.validUntil && d.validUntil < now;
                    const expiring = d.validUntil && !expired && d.validUntil < soon;
                    return (
                      <tr key={d.id} className="border-t border-border hover:bg-accent/50 align-top">
                        <td className="px-4 py-2.5 max-w-xs">
                          <a href={`/api/documents/${d.id}/file`} target="_blank" className="font-medium hover:text-primary block truncate" title={d.originalName}>{d.originalName}</a>
                          <p className="text-xs text-muted-foreground truncate">
                            {[d.description, formatFileSize(d.fileSize), `nahráno ${fmtDate(d.createdAt)}`].filter(Boolean).join(" · ")}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{companyDocCategoryLabel(d.docCategory)}</td>
                        {companies.length > 1 && <td className="px-4 py-2.5 whitespace-nowrap">{d.client?.name || "—"}</td>}
                        <td className={cn("px-4 py-2.5 whitespace-nowrap", expired ? "text-red-600 font-medium" : expiring ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                          {d.validUntil ? fmtDate(d.validUntil) : "—"}
                          {expired && " (prošlá)"}
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <a href={`/api/documents/${d.id}/file`} target="_blank" className="inline-flex p-1.5 text-muted-foreground hover:text-foreground" title="Otevřít"><ExternalLink className="w-4 h-4" /></a>
                          <a href={`/api/documents/${d.id}/file?download`} className="inline-flex p-1.5 text-muted-foreground hover:text-foreground" title="Stáhnout"><Download className="w-4 h-4" /></a>
                          {session?.role !== "client" && (
                            <ActionButton url={`/api/documents/${d.id}`} method="PATCH" body={{ archived: !showArchived }} variant="ghost" className="px-1.5" title={showArchived ? "Obnovit" : "Archivovat"} success={showArchived ? "Obnoveno" : "Archivováno"}>
                              {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <CompanyDocUpload clients={companies} defaultClientId={clientId} />
      </div>
    </div>
  );
}
