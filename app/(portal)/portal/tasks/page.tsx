export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDate, statusLabel, priorityLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Clock, FileText } from "lucide-react";
import TaskStatusButtons from "@/components/TaskStatusButtons";

export default async function PortalTasksPage() {
  const session = await getSession();
  if (!session || session.role !== "client" || !session.clientId) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: { clientId: session.clientId },
    include: { document: true },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
  });

  const active = tasks.filter((t) => ["pending", "in_progress"].includes(t.status));
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Moje úkoly</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {active.length} aktivních · {done.length} dokončených
        </p>
      </div>

      {active.length === 0 && done.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-muted-foreground">Žádné úkoly 🎉</p>
        </div>
      ) : (
        <>
          {active.map((task) => {
            const isOverdue = task.dueDate && task.dueDate < new Date();
            return (
              <div
                key={task.id}
                className={cn(
                  "bg-card border border-border rounded-xl p-5 space-y-4",
                  isOverdue && "border-red-200 bg-red-50/30"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{task.title}</h2>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                    )}
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full font-medium shrink-0",
                    task.status === "pending" ? "bg-amber-100 text-amber-700" :
                    task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  )}>
                    {statusLabel(task.status)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{priorityLabel(task.priority)} priorita</span>
                  {task.dueDate && (
                    <span className={cn("flex items-center gap-1", isOverdue && "text-red-500 font-medium")}>
                      <Clock className="w-3 h-3" />
                      {formatDate(task.dueDate)}
                    </span>
                  )}
                  <span>Vytvořeno: {formatDate(task.createdAt)}</span>
                </div>

                {task.document && (
                  <a
                    href={task.document.fileUrl}
                    target="_blank"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{task.document.originalName}</p>
                    </div>
                  </a>
                )}

                <TaskStatusButtons taskId={task.id} currentStatus={task.status} />
              </div>
            );
          })}

          {done.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                Dokončené ({done.length})
              </h2>
              <div className="space-y-2">
                {done.map((task) => (
                  <div key={task.id} className="bg-card border border-border rounded-xl p-4 opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <p className="text-sm font-medium text-foreground flex-1 truncate">{task.title}</p>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {statusLabel(task.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
