"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { DOC_TYPES } from "@/lib/docs/types";

export default function RequestForm({ transactionId, clientId, defaultDocType }: { transactionId?: string; clientId?: string; defaultDocType?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [docType, setDocType] = useState(defaultDocType || "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, clientId, message, docType: docType || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.telegramSent ? "Požadavek odeslán do Telegramu" : "Požadavek uložen (Telegram není připojen)");
      setMessage("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder="Např.: Chybí faktura od dodavatele, prosím nahrát."
        className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background resize-none"
      />
      <div className="flex gap-2">
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background">
          <option value="">Jakýkoli doklad</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.cs}</option>
          ))}
        </select>
        <button disabled={busy || !message.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Vyžádat doklad
        </button>
      </div>
    </form>
  );
}
