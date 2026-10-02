"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, X } from "lucide-react";

export type EditableDoc = {
  id: string;
  originalName: string;
  clientId: string | null;
  extractedCounterparty: string | null;
  extractedIco: string | null;
  extractedNumber: string | null;
  extractedDate: string | null; // YYYY-MM-DD
  extractedAmount: string | null;
  extractedCurrency: string | null;
  extractedVs: string | null;
};

const input = "w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background";

/** Ручне виправлення того, що розпізнав AI: контрагент, сума, дата, VS, фірма… */
export default function DocEditButton({ doc, clients }: { doc: EditableDoc; clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(doc);
  const set = (k: keyof EditableDoc) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id, originalName, ...body } = f;
      void originalName;
      const res = await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      toast.success(data.autoLinked ? "Uloženo — doklad se sám přiřadil k platbě" : "Uloženo");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setF(doc); setOpen(true); }} title="Opravit údaje dokladu" aria-label="Opravit údaje dokladu" className="inline-flex items-center px-2 py-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
        <Pencil className="w-4 h-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">Opravit údaje dokladu</h2>
                <p className="text-xs text-muted-foreground truncate">{doc.originalName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Protistrana</span>
              <input className={input} value={f.extractedCounterparty ?? ""} onChange={set("extractedCounterparty")} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">IČO protistrany</span>
                <input className={input} value={f.extractedIco ?? ""} onChange={set("extractedIco")} />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Číslo dokladu</span>
                <input className={input} value={f.extractedNumber ?? ""} onChange={set("extractedNumber")} />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Datum</span>
                <input type="date" className={input} value={f.extractedDate ?? ""} onChange={set("extractedDate")} />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">VS</span>
                <input className={input} inputMode="numeric" value={f.extractedVs ?? ""} onChange={set("extractedVs")} />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Částka (bez znaménka)</span>
                <input className={input} inputMode="decimal" value={f.extractedAmount ?? ""} onChange={set("extractedAmount")} placeholder="1 250,50" />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Měna</span>
                <select className={input} value={f.extractedCurrency ?? "CZK"} onChange={set("extractedCurrency")}>
                  {["CZK", "EUR", "USD", "UAH", "PLN", "GBP"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted-foreground space-y-1">
                <span className="block">Firma</span>
              <select className={input} value={f.clientId ?? ""} onChange={set("clientId")}>
                <option value="">— nepřiřazeno —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent">Zrušit</button>
              <button disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Uložit
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
