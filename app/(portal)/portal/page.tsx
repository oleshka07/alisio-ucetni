export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDate, statusLabel, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  CheckSquare,
  FileText,
  Clock,
  Calendar,
  AlertTriangle,
} from "lucide-react";

export default async function PortalDashboard() {
  const session = await getSession();
  if (!session || session.role !== "client" || !session.clientId) redirect("/login");

  const [client, tasks, documents, taxEvents] = await Promise.all([
    prisma.client.findUnique({
      where: { id: session.clientId },
      include: { companyProfile: true },
    }),
    prisma.task.findMany({
      where: { clientId: session.clientId, status: { in: ["pending", "in_progress"] } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
    }),
    prisma.document.findMany({
      where: { clientId: session.clientId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.taxEvent.findMany({
      where: { clientId: session.clientId, status: { in: ["upcoming", "overdue"] } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  if (!client) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Vítejte, {client.companyProfile?.contactPerson || client.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {client.name} · {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full" }).format(new Date())}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active tasks */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              Moje úkoly
            </h2>
            <Link href="/portal/tasks" className="text-xs text-primary hover:underline">Vše</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Žádné aktivní úkoly 🎉</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < new Date();
                return (
                  <Link
                    key={task.id}
                    href={`/portal/tasks`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      task.priority === "high" ? "bg-red-500" :
                      task.priority === "normal" ? "bg-amber-500" : "bg-gray-300"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        task.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {statusLabel(task.status)}
                      </span>
                      {task.dueDate && (
                        <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                          <Clock className="w-3 h-3" />
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Tax calendar */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Daňové povinnosti</h2>
          </div>
          {taxEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Žádné nadcházející události</p>
          ) : (
            <div className="space-y-2">
              {taxEvents.map((ev) => {
                const isOverdue = ev.dueDate < new Date() && ev.status === "upcoming";
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg",
                      isOverdue ? "bg-red-50 border border-red-100" : "hover:bg-accent"
                    )}
                  >
                    {isOverdue ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{ev.title}</p>
                      <p className={cn("text-xs", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                        {formatDate(ev.dueDate)}
                      </p>
                    </div>
                    {ev.amount && (
                      <span className="text-sm font-semibold text-foreground shrink-0">
                        {formatCurrency(ev.amount)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Recent documents */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Poslední dokumenty
          </h2>
          <Link href="/portal/documents" className="text-xs text-primary hover:underline">Vše</Link>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Žádné dokumenty</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <a
                key={doc.id}
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  doc.uploadedBy === "accountant" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                }`}>
                  {doc.uploadedBy === "accountant" ? "Od účetní" : "Ode mě"}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
