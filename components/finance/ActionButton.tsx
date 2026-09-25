"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  success?: string;
  onDone?: (data: unknown) => void;
};

export const btn = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-card border border-border text-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  danger: "bg-card border border-red-200 text-red-600 hover:bg-red-50",
};

export default function ActionButton({ url, method = "POST", body, children, className, variant = "secondary", confirm, success, onDone }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      if (success) toast.success(success);
      onDone?.(data);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50", btn[variant], className)}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}
