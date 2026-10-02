"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";

const METHODS = [
  { key: "cash", label: "Hotově" },
  { key: "private_card", label: "Soukromou kartou" },
  { key: "other", label: "Jinak mimo banku" },
];

/** Doklad zaplacený mimo bankovní účet → platba z údajů dokladu. Neaktivní, dokud doklad nemá vše potřebné. */
export default function ManualPaymentButton({ documentId, blocker }: { documentId: string; blocker: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(method: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      toast.success("Platba vytvořena a doklad přiřazen");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const title = blocker ? `Zaplaceno mimo banku — ${blocker}` : "Zaplaceno mimo banku (hotově, soukromou kartou)";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        disabled={!!blocker || busy}
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-label={title}
        className="inline-flex items-center px-2 py-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
      </button>
      {open && (
        <span className="absolute right-0 top-full mt-1 z-40 w-52 bg-card border border-border rounded-lg shadow-lg p-1 text-left">
          <span className="block px-2 py-1 text-xs text-muted-foreground">Zaplaceno mimo banku:</span>
          {METHODS.map((m) => (
            <button key={m.key} type="button" onClick={() => create(m.key)} className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent">
              {m.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
