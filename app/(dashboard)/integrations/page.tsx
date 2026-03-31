import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Plug, ExternalLink, Lock } from "lucide-react";

const INTEGRATION_INFO: Record<string, { description: string; docs?: string; color: string }> = {
  fakturoid: {
    description: "Fakturace, vydané a přijaté faktury, pohledávky",
    docs: "https://www.fakturoid.cz/api",
    color: "#0070f3",
  },
  pohoda: {
    description: "Ekonomický software POHODA — import/export dat",
    color: "#e65100",
  },
  ares: {
    description: "ARES — Administrativní registr ekonomických subjektů (OR)",
    docs: "https://ares.gov.cz",
    color: "#1b5e20",
  },
  moje_id: {
    description: "mojeID / ePortál ČSSZ — jednotné měsíční hlášení",
    color: "#4a148c",
  },
  csob: {
    description: "ČSOB Business Banking API — výpisy z účtu",
    color: "#003087",
  },
  kb: {
    description: "Komerční banka Open Banking API — výpisy z účtu",
    color: "#d50000",
  },
};

export default async function IntegrationsPage() {
  const integrations = await prisma.apiIntegration.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrace</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Propojení s externími účetními a bankovními systémy
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">Integrace se připravují</p>
          <p className="text-xs text-amber-700 mt-0.5">
            API napojení na níže uvedené systémy budou postupně aktivována.
            Architektura je připravena — stačí přidat API klíče.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((integration) => {
          const info = INTEGRATION_INFO[integration.name] ?? {};
          return (
            <div
              key={integration.id}
              className={cn(
                "bg-card border border-border rounded-xl p-5",
                integration.isActive && "border-green-200 bg-green-50/30"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: info.color ?? "#6366f1" }}
                  >
                    {integration.displayName[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{integration.displayName}</p>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      integration.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    )}>
                      {integration.isActive ? "Aktivní" : "Neaktivní"}
                    </span>
                  </div>
                </div>
                {info.docs && (
                  <a
                    href={info.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{info.description}</p>
              <button
                disabled
                className="mt-3 w-full py-1.5 text-xs rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent cursor-not-allowed"
              >
                Konfigurovat (připravuje se)
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
