import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import ClientForm from "@/components/ClientForm";
import { Clock, User as UserIcon } from "lucide-react";

export default async function PortalProfilePage() {
  const session = await getSession();
  if (!session || session.role !== "client" || !session.clientId) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    include: {
      companyProfile: true,
      employeeProfile: true,
      taxProfile: true,
      insuranceProfile: true,
      auditLogs: {
        where: { action: "profile_updated" },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!client) redirect("/login");

  // Strip prisma metadata fields
  const strip = (obj: Record<string, unknown> | null) => {
    if (!obj) return {};
    const { id: _id, clientId: _cid, ...rest } = obj as Record<string, unknown>;
    return rest as Record<string, string | boolean>;
  };

  const initialData = {
    basic: { name: client.name, type: client.type, role: client.role, color: client.color },
    company: strip(client.companyProfile as Record<string, unknown> | null),
    employee: strip(client.employeeProfile as Record<string, unknown> | null),
    tax: strip(client.taxProfile as Record<string, unknown> | null),
    insurance: strip(client.insuranceProfile as Record<string, unknown> | null),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Můj profil</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Úpravy údajů se automaticky zaznamenávají
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ClientForm mode="edit" clientId={client.id} initialData={initialData} isPortal />
        </div>

        {/* Audit log */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Historie změn
          </h3>
          {client.auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Zatím žádné změny
            </p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {client.auditLogs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <UserIcon className="w-3 h-3 text-muted-foreground" />
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      log.changedBy === "accountant" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    }`}>
                      {log.changedBy === "accountant" ? "Účetní" : "Klient"}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                  </div>
                  {log.summary && (
                    <p className="text-xs text-foreground">{log.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
