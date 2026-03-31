"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

export default function CreateTaskForm({
  clients,
}: {
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !clientId) {
      toast.error("Zadejte název úkolu a vyberte klienta");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          clientId,
          priority,
          dueDate: dueDate || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      toast.success("Úkol vytvořen!");
      setTitle("");
      setDescription("");
      setDueDate("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chyba při vytváření");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Client */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Klient</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Název úkolu *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Např.: Podepsat plnou moc"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Popis (volitelné)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Instrukce pro klienta..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
        />
      </div>

      {/* Priority + Due date */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Priorita</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="low">Nízká</option>
            <option value="normal">Normální</option>
            <option value="high">Vysoká</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Termín</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Vytvořit úkol
          </>
        )}
      </button>
    </form>
  );
}
