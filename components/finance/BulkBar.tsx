"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2, Trash2, X } from "lucide-react";
import { DOC_TYPES } from "@/lib/docs/types";

const SEL = 'input[name="docSel"]';

function checkedIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`${SEL}:checked`)).map((i) => i.value);
}

/** Zaškrtávátko „vybrat vše“ v hlavičce tabulky. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Vybrat vše"
      className="w-4 h-4 accent-primary"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(SEL).forEach((i) => (i.checked = e.target.checked));
        document.dispatchEvent(new Event("docsel"));
      }}
    />
  );
}

/** Panel hromadných akcí — objeví se, když je vybrán aspoň jeden doklad. */
export default function BulkBar({ archive, isOwner, clients }: { archive: boolean; isOwner: boolean; clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setIds(checkedIds());
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement)?.matches?.(SEL)) update();
    };
    document.addEventListener("change", onChange);
    document.addEventListener("docsel", update);
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("docsel", update);
    };
  }, []);

  function clear() {
    document.querySelectorAll<HTMLInputElement>(`${SEL}, input[aria-label="Vybrat vše"]`).forEach((i) => (i.checked = false));
    setIds([]);
  }

  async function run(action: string, value?: string | null, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/documents/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      toast.success(`Hotovo: ${data.done} z ${ids.length}${data.autoLinked ? ` · automaticky přiřazeno ${data.autoLinked}` : ""}`);
      for (const err of data.errors || []) toast.error(err);
      clear();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  if (!ids.length) return null;
  const sel = "text-sm border border-border rounded-md px-2 py-1 bg-background";
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border shadow-xl rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm max-w-[calc(100vw-2rem)]">
      <span className="font-medium">Vybráno {ids.length}</span>
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {archive ? (
        <>
          <button disabled={busy} onClick={() => run("unarchive")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-accent">
            <ArchiveRestore className="w-3.5 h-3.5" /> Obnovit
          </button>
          {isOwner && (
            <button disabled={busy} onClick={() => run("delete", null, `Smazat ${ids.length} dokladů natrvalo? Soubory nepůjde obnovit.`)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Smazat natrvalo
            </button>
          )}
        </>
      ) : (
        <>
          <button disabled={busy} onClick={() => run("archive")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-accent">
            <Archive className="w-3.5 h-3.5" /> Archivovat
          </button>
          <select disabled={busy} className={sel} value="" onChange={(e) => e.target.value && run("docType", e.target.value === "-" ? null : e.target.value)}>
            <option value="">Změnit typ…</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.cs}</option>)}
          </select>
          {clients.length > 0 && (
            <select disabled={busy} className={sel} value="" onChange={(e) => e.target.value && run("clientId", e.target.value === "-" ? null : e.target.value)}>
              <option value="">Přiřadit firmě…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="-">— bez firmy —</option>
            </select>
          )}
        </>
      )}
      <button onClick={clear} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Zrušit výběr"><X className="w-4 h-4" /></button>
    </div>
  );
}
