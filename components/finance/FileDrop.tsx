"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/docs/types";

type Props = {
  url: string;
  label?: string;
  withDocType?: boolean;
  defaultDocType?: string;
  extra?: Record<string, string>;
  accept?: string;
  compact?: boolean;
};

type Result = { name?: string; duplicate?: boolean; autoLinked?: boolean; linkedTo?: string[]; candidates?: number };

export default function FileDrop({ url, label = "Přetáhněte soubory sem nebo klikněte", withDocType, defaultDocType = "", extra, accept, compact }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState(defaultDocType);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      list.forEach((f) => form.append("file", f));
      if (docType) form.append("docType", docType);
      Object.entries(extra || {}).forEach(([k, v]) => v && form.append(k, v));
      const res = await fetch(url, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      const results: Result[] = data.results || [];
      const dup = results.filter((r) => r.duplicate).length;
      const auto = results.filter((r) => r.autoLinked).length;
      if (data.imported !== undefined) toast.success(`Importováno ${data.imported} z ${data.total} plateb`);
      else toast.success(`Nahráno ${results.length}${auto ? ` · automaticky přiřazeno ${auto}` : ""}${dup ? ` · ${dup} už v systému byl(o)` : ""}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nahrání selhalo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {withDocType && (
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background">
          <option value="">Typ dokladu: rozpoznat automaticky</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.cs}</option>
          ))}
        </select>
      )}
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        className={cn(
          "border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors text-sm text-muted-foreground",
          compact ? "p-3" : "p-6",
          over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Nahrávám a rozpoznávám…</span>
        ) : (
          <span className="inline-flex items-center gap-2"><Upload className="w-4 h-4" /> {label}</span>
        )}
        <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
    </div>
  );
}
