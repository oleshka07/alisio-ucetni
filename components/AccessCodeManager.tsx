"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Copy, Check, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AccessCodeManager({
  clientId,
  clientName,
  currentCode,
  codeCreatedAt,
}: {
  clientId: string;
  clientName: string;
  currentCode: string | null;
  codeCreatedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const displayCode = newCode || currentCode;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/access-code`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewCode(data.accessCode);
      toast.success("Přístupový kód vygenerován!");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/access-code`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewCode(null);
      toast.success("Přístup odebrán");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = () => {
    if (!displayCode) return;
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    toast.success("Kód zkopírován do schránky");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm text-foreground">Přístup klienta do portálu</h3>
      </div>

      {displayCode ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="font-mono text-lg tracking-[0.3em] font-bold text-foreground flex-1 text-center">
              {displayCode}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md hover:bg-accent transition-colors shrink-0"
              title="Kopírovat"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {codeCreatedAt && (
            <p className="text-xs text-muted-foreground">
              Vytvořeno: {new Date(codeCreatedAt).toLocaleDateString("cs-CZ")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Nový kód
            </button>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Odebrat přístup
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Klient nemá přístup do portálu. Vygenerujte kód pro přihlášení.
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Vygenerovat přístupový kód
          </button>
        </div>
      )}
    </div>
  );
}
