"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { COMPANY_DOC_CATEGORIES } from "@/lib/docs/company-docs";

const input = "w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background";

/** Nahrání firemního dokumentu: firma, kategorie, platnost do, popis, soubory. */
export default function CompanyDocUpload({ clients, defaultClientId }: { clients: Array<{ id: string; name: string }>; defaultClientId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(defaultClientId || clients[0]?.id || "");
  const [category, setCategory] = useState("registry");
  const [validUntil, setValidUntil] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files?.length) return toast.error("Vyberte soubor");
    setBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("file", f));
      form.append("clientId", clientId);
      form.append("docCategory", category);
      if (validUntil) form.append("validUntil", validUntil);
      if (description) form.append("description", description);
      const res = await fetch("/api/company-docs", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      toast.success(`Nahráno ${data.results?.length ?? 0}`);
      if (fileRef.current) fileRef.current.value = "";
      setDescription("");
      setValidUntil("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-sm">Nahrát dokument firmy</h2>
      {clients.length > 1 && (
        <label className="block text-xs text-muted-foreground space-y-1">
          <span className="block">Firma</span>
          <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="block text-xs text-muted-foreground space-y-1">
        <span className="block">Kategorie</span>
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(COMPANY_DOC_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground space-y-1">
        <span className="block">Platnost do (volitelné — připomeneme)</span>
        <input type="date" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>
      <label className="block text-xs text-muted-foreground space-y-1">
        <span className="block">Popis (volitelné)</span>
        <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="např. výpis ke dni 1. 10. 2026" />
      </label>
      <input ref={fileRef} type="file" multiple className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-background file:text-sm" />
      <button disabled={busy || !clientId} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Nahrát
      </button>
    </form>
  );
}
