import { cn } from "@/lib/utils";
import { DOC_STATUS } from "@/lib/docs/types";

export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = DOC_STATUS[status] ?? { cs: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", s.cls, className)}>{s.cs}</span>;
}
