"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export default function ExportForm({ clients, defaultClientId, defaultMonth }: { clients: { id: string; name: string }[]; defaultClientId?: string; defaultMonth: string }) {
  const [clientId, setClientId] = useState(defaultClientId || clients[0]?.id || "");
  const [month, setMonth] = useState(defaultMonth);
  return (
    <div className="flex items-center gap-2">
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="text-sm border border-border rounded-md px-2 py-1.5 bg-background">
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="text-sm border border-border rounded-md px-2 py-1 bg-background" />
      <a
        href={`/api/export/month?clientId=${clientId}&month=${month}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-card border border-border hover:bg-accent"
      >
        <Download className="w-3.5 h-3.5" /> ZIP za měsíc
      </a>
    </div>
  );
}
