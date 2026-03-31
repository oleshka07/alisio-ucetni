import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatDate, statusLabel, priorityLabel } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import TaskStatusButtons from "@/components/TaskStatusButtons";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: { client: true, document: true },
  });

  if (!task) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Zpět na úkoly
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-foreground">{task.title}</h1>
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-medium shrink-0",
            task.status === "pending" ? "bg-amber-100 text-amber-700" :
            task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
            task.status === "done" ? "bg-green-100 text-green-700" :
            "bg-gray-100 text-gray-500"
          )}>
            {statusLabel(task.status)}
          </span>
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Klient</p>
            <Link href={`/clients/${task.client.id}`} className="text-sm font-medium text-primary hover:underline">
              {task.client.name}
            </Link>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Priorita</p>
            <p className="text-sm font-medium text-foreground">{priorityLabel(task.priority)}</p>
          </div>
          {task.dueDate && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Termín</p>
              <p className="text-sm font-medium text-foreground">{formatDate(task.dueDate)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Vytvořeno</p>
            <p className="text-sm font-medium text-foreground">{formatDate(task.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Autor</p>
            <p className="text-sm font-medium text-foreground">
              {task.createdBy === "accountant" ? "Účetní" : "Klient"}
            </p>
          </div>
        </div>

        {task.document && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Přiložený dokument</p>
            <a
              href={task.document.fileUrl}
              target="_blank"
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{task.document.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {task.document.uploadedBy === "accountant" ? "Nahráno účetní" : "Nahráno klientem"}
                </p>
              </div>
              <Download className="w-4 h-4 text-muted-foreground shrink-0" />
            </a>
          </div>
        )}

        {/* Status change buttons */}
        <div className="pt-3 border-t border-border">
          <TaskStatusButtons taskId={task.id} currentStatus={task.status} />
        </div>
      </div>
    </div>
  );
}
