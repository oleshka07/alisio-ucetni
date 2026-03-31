export const dynamic = 'force-dynamic';

import { prisma } from "@/lib/prisma";
import { formatDate, formatFileSize } from "@/lib/utils";
import DocumentUploadForm from "@/components/DocumentUploadForm";
import Link from "next/link";
import { FileText, Download } from "lucide-react";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;

  const [documents, clients] = await Promise.all([
    prisma.document.findMany({
      where: clientId ? { clientId } : undefined,
      include: { client: true, task: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dokumenty</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {documents.length} dokumentů{selectedClient ? ` · ${selectedClient.name}` : ""}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {documents.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Žádné dokumenty</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Link
                          href={`/clients/${doc.client.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {doc.client.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          doc.uploadedBy === "accountant" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                        }`}>
                          {doc.uploadedBy === "accountant" ? "Od účetní" : "Od klienta"}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Stáhnout"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload panel */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-1 text-sm">Nahrát dokument</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Vyberte klienta a nahrajte dokument. Automaticky se vytvoří úkol.
            </p>

            {/* Client selector */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Klient</label>
              <div className="space-y-1">
                {clients.map((c) => (
                  <Link
                    key={c.id}
                    href={`/documents?clientId=${c.id}`}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                      clientId === c.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>

            {selectedClient ? (
              <DocumentUploadForm clientId={selectedClient.id} uploadedBy="accountant" />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                Vyberte klienta výše
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
