"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DOC_TYPES } from "@/lib/docs/types";
import { cn } from "@/lib/utils";

export default function DocTypeSelect({ documentId, value, className }: { documentId: string; value: string; className?: string }) {
  const router = useRouter();
  async function change(docType: string) {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || "Nepodařilo se uložit");
    else if (data.movedToStatements) toast.success(`Přesunuto do výpisů — ${data.movedToStatements}`);
    else if (docType === "company_doc") toast.success("Přesunuto do dokumentů firmy");
    router.refresh();
  }
  return (
    <select defaultValue={value} onChange={(e) => change(e.target.value)} className={cn("text-xs border border-border rounded-md px-2 py-1 bg-background", className)}>
      <option value="">Typ nerozpoznán</option>
      {Object.entries(DOC_TYPES).map(([k, v]) => (
        <option key={k} value={k}>{v.cs}</option>
      ))}
      <option value="company_doc">Dokument firmy (plná moc, výpis z OR…) →</option>
    </select>
  );
}
