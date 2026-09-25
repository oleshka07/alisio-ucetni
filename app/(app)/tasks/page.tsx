export const dynamic = 'force-dynamic';

import { prisma } from "@/lib/prisma";
import { formatDate, statusLabel, priorityLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Clock, FileText } from "lucide-react";
import TaskStatusButtons from "@/components/TaskStatusButtons";
import CreateTaskForm from "@/components/CreateTaskForm";

export default async function TasksPage() {
  const [tasks, clients] = await Promise.all([
    prisma.task.findMany({
      include: { client: true, document: true },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const grouped = {
    active: tasks.filter((t) => ["pending", "in_progress"].includes(t.status)),
    done: tasks.filter((t) => t.status === "done"),
    cancelled: tasks.filter((t) => t.status === "cancelled"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Úkoly</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {grouped.active.length} aktivních · {grouped.done.length} dokončených
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TaskGroup title="Aktivní" tasks={grouped.active} />
          {grouped.done.length > 0 && <TaskGroup title="Dokončené" tasks={grouped.done} muted />}
          {grouped.cancelled.length > 0 && <TaskGroup title="Zrušené" tasks={grouped.cancelled} muted />}
        </div>

        <div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-1 text-sm">Nový úkol</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Vytvořte úkol pro klienta.
            </p>
            <CreateTaskForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  muted,
}: {
  title: string;
  tasks: Awaited<ReturnType<typeof prisma.task.findMany<{ include: { client: true; document: true } }>>>;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <h2 className={cn("text-sm font-semibold mb-3", muted ? "text-muted-foreground" : "text-foreground")}>
        {title} ({tasks.length})
      </h2>
      <div className="space-y-3">
        {tasks.map((task) => {
          const isOverdue =
            task.dueDate && task.dueDate < new Date() && task.status !== "done" && task.status !== "cancelled";
          return (
            <div
              key={task.id}
              className={cn(
                "bg-card border border-border rounded-xl p-4 space-y-3",
                isOverdue && "border-red-200 bg-red-50/30"
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                  task.priority === "high" ? "bg-red-500" :
                  task.priority === "normal" ? "bg-amber-400" : "bg-gray-300"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <Link
                      href={`/clients/${task.client.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {task.client.name}
                    </Link>
                    {task.document && (
                      <a
                        href={`/api/documents/${task.document.id}/file`}
                        target="_blank"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <FileText className="w-3 h-3" />
                        {task.document.originalName}
                      </a>
                    )}
                    {task.dueDate && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                      )}>
                        <Clock className="w-3 h-3" />
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{priorityLabel(task.priority)}</span>
                  </div>
                </div>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                  task.status === "pending" ? "bg-amber-100 text-amber-700" :
                  task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                  task.status === "done" ? "bg-green-100 text-green-700" :
                  "bg-gray-100 text-gray-500"
                )}>
                  {statusLabel(task.status)}
                </span>
              </div>

              {/* Inline status buttons */}
              {!muted && <TaskStatusButtons taskId={task.id} currentStatus={task.status} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
