"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Play, XCircle, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Čekající", icon: RotateCcw, color: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  { value: "in_progress", label: "Probíhá", icon: Play, color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  { value: "done", label: "Hotovo", icon: CheckCircle, color: "bg-green-100 text-green-700 hover:bg-green-200" },
  { value: "cancelled", label: "Zrušeno", icon: XCircle, color: "bg-gray-100 text-gray-500 hover:bg-gray-200" },
];

export default function TaskStatusButtons({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setLoading(newStatus);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      const statusLabel = STATUS_OPTIONS.find((s) => s.value === newStatus)?.label;
      toast.success(`Status změněn na "${statusLabel}"`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Chyba při změně statusu");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Změnit status
      </p>
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(({ value, label, icon: Icon, color }) => (
          <button
            key={value}
            onClick={() => handleStatusChange(value)}
            disabled={loading !== null || value === currentStatus}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              value === currentStatus
                ? cn(color, "ring-2 ring-offset-1 ring-current opacity-100 cursor-default")
                : cn(color, "opacity-70 hover:opacity-100"),
              loading !== null && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading === value ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icon className="w-3.5 h-3.5" />
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
