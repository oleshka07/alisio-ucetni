export const dynamic = 'force-dynamic';

import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, statusLabel, priorityLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import FinanceSummary from "@/components/finance/FinanceSummary";
import {
  Building2,
  User,
  CheckSquare,
  FileText,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ArrowRight,
  Clock,
} from "lucide-react";

export default async function DashboardPage() {
  const [clients, tasks, taxEvents, documents] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, include: { companyProfile: true } }),
    prisma.task.findMany({
      where: { status: { in: ["pending", "in_progress"] } },
      include: { client: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
    }),
    prisma.taxEvent.findMany({
      where: { status: { in: ["upcoming", "overdue"] } },
      include: { client: true },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { client: true },
    }),
  ]);

  const totalTaxThisYear = await prisma.taxEvent.aggregate({
    where: { period: { contains: "2025" }, status: { not: "cancelled" } },
    _sum: { amount: true },
  });

  const overdueTasks = await prisma.task.count({
    where: {
      status: { in: ["pending", "in_progress"] },
      dueDate: { lt: new Date() },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Přehled</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full" }).format(new Date())}
        </p>
      </div>

      <FinanceSummary />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Klienti / entity"
          value={clients.length}
          icon={<Building2 className="w-5 h-5" />}
          color="indigo"
        />
        <StatCard
          label="Aktivní úkoly"
          value={tasks.length}
          icon={<CheckSquare className="w-5 h-5" />}
          color="amber"
          badge={overdueTasks > 0 ? `${overdueTasks} po splatnosti` : undefined}
          badgeColor="red"
        />
        <StatCard
          label="Daně 2025 (odhad)"
          value={formatCurrency(totalTaxThisYear._sum.amount ?? 0)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          label="Dokumenty"
          value={documents.length}
          icon={<FileText className="w-5 h-5" />}
          color="sky"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Clients */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Moji klienti</h2>
            <Link href="/clients/new" className="text-xs text-primary hover:underline">
              + Přidat
            </Link>
          </div>
          <div className="space-y-2">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: client.color + "20" }}
                >
                  {client.type === "company" ? (
                    <Building2 className="w-5 h-5" style={{ color: client.color }} />
                  ) : (
                    <User className="w-5 h-5" style={{ color: client.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {client.companyProfile?.ico ? `IČO: ${client.companyProfile.ico}` : client.role}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </section>

        {/* Upcoming taxes */}
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Daňový kalendář</h2>
            <Link href="/calendar" className="text-xs text-primary hover:underline">
              Vše
            </Link>
          </div>
          <div className="space-y-2">
            {taxEvents.map((ev) => {
              const isOverdue = ev.dueDate < new Date() && ev.status === "upcoming";
              return (
                <div
                  key={ev.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg",
                    isOverdue ? "bg-red-50 border border-red-100" : "hover:bg-accent"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                    isOverdue ? "bg-red-100" : "bg-muted"
                  )}>
                    {isOverdue ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{ev.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{ev.client.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {ev.amount && (
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(ev.amount)}
                      </p>
                    )}
                    <p className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                      {formatDate(ev.dueDate)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Tasks */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Aktivní úkoly</h2>
          <Link href="/tasks" className="text-xs text-primary hover:underline">
            Vše
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Žádné aktivní úkoly</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const isOverdue = task.dueDate && task.dueDate < new Date();
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    task.priority === "high" ? "bg-red-500" :
                    task.priority === "normal" ? "bg-amber-500" : "bg-gray-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.client.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      task.status === "pending" ? "bg-amber-100 text-amber-700" :
                      task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      "bg-green-100 text-green-700"
                    )}>
                      {statusLabel(task.status)}
                    </span>
                    {task.dueDate && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        isOverdue ? "text-red-500" : "text-muted-foreground"
                      )}>
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
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  badge,
  badgeColor,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: "indigo" | "amber" | "emerald" | "sky";
  badge?: string;
  badgeColor?: "red";
}) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colors[color])}>
          {icon}
        </div>
        {badge && (
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            badgeColor === "red" ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"
          )}>
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
