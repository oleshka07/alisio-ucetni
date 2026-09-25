"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DOC_TYPES } from "@/lib/docs/types";

export default function DocTypeSelect({ documentId, value }: { documentId: string; value: string }) {
  const router = useRouter();
  async function change(docType: string) {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docType }),
    });
    if (!res.ok) toast.error("Nepodařilo se uložit");
    router.refresh();
  }
  return (
    <select defaultValue={value} onChange={(e) => change(e.target.value)} className="text-xs border border-border rounded-md px-2 py-1 bg-background">
      <option value="">Typ nerozpoznán</option>
      {Object.entries(DOC_TYPES).map(([k, v]) => (
        <option key={k} value={k}>{v.cs}</option>
      ))}
    </select>
  );
}
