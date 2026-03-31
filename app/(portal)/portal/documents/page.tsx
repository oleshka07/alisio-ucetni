import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDate, formatFileSize } from "@/lib/utils";
import DocumentUploadForm from "@/components/DocumentUploadForm";
import { FileText, Download } from "lucide-react";

export default async function PortalDocumentsPage() {
  const session = await getSession();
  if (!session || session.role !== "client" || !session.clientId) redirect("/login");

  const documents = await prisma.document.findMany({
    where: { clientId: session.clientId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dokumenty</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{documents.length} dokumentů</p>
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
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          doc.uploadedBy === "accountant" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                        }`}>
                          {doc.uploadedBy === "accountant" ? "Od účetní" : "Ode mě"}
                        </span>
                      </div>
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

        {/* Upload */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-1 text-sm">Nahrát dokument</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Nahrajte dokument pro účetní.
          </p>
          <DocumentUploadForm clientId={session.clientId} uploadedBy="client" />
        </div>
      </div>
    </div>
  );
}
