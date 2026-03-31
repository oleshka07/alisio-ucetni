export const dynamic = 'force-dynamic';

import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar, CheckCircle, Clock, TrendingUp } from "lucide-react";

export default async function CalendarPage() {
  const events = await prisma.taxEvent.findMany({
    include: { client: true },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const currentYear = now.getFullYear();

  // Group by client
  const byClient = events.reduce((acc, ev) => {
    if (!acc[ev.clientId]) acc[ev.clientId] = { client: ev.client, events: [] };
    acc[ev.clientId].events.push(ev);
    return acc;
  }, {} as Record<string, { client: (typeof events)[0]["client"]; events: typeof events }>);

  // Annual totals per client
  const annualTotal = Object.entries(byClient).map(([clientId, { client, events }]) => ({
    client,
    total: events
      .filter((e) => e.period?.includes(String(currentYear)) && e.status !== "cancelled")
      .reduce((sum, e) => sum + (e.amount ?? 0), 0),
    paid: events
      .filter((e) => e.status === "paid")
      .reduce((sum, e) => sum + (e.amount ?? 0), 0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Daňový kalendář</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Přehled daňových povinností a prognóza {currentYear}
        </p>
      </div>

      {/* Annual summary */}
      <div className="grid md:grid-cols-3 gap-4">
        {annualTotal.map(({ client, total, paid }) => (
          <div key={client.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: client.color }}
              />
              <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Celkem {currentYear}</span>
                <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Zaplaceno</span>
                <span className="font-medium text-green-600">{formatCurrency(paid)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Zbývá</span>
                <span className="font-semibold text-amber-600">{formatCurrency(total - paid)}</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: total > 0 ? `${Math.min(100, (paid / total) * 100)}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Events table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground text-sm">Všechny daňové události</h2>
        </div>
        <div className="divide-y divide-border">
          {events.map((ev) => {
            const isOverdue = ev.dueDate < now && ev.status === "upcoming";
            const isPaid = ev.status === "paid";
            return (
              <div
                key={ev.id}
                className={cn(
                  "flex items-center gap-4 px-5 py-3.5",
                  isOverdue && "bg-red-50",
                  isPaid && "opacity-60"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                  isOverdue ? "bg-red-100" : isPaid ? "bg-green-100" : "bg-muted"
                )}>
                  {isOverdue ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : isPaid ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : ev.isPredicted ? (
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{ev.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ev.client.color }}
                    />
                    <p className="text-xs text-muted-foreground truncate">{ev.client.name}</p>
                    {ev.period && (
                      <span className="text-xs text-muted-foreground">· {ev.period}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {ev.amount && (
                    <p className="text-sm font-semibold text-foreground text-right">
                      {formatCurrency(ev.amount)}
                    </p>
                  )}
                  <div className="text-right">
                    <p className={cn(
                      "text-xs font-medium",
                      isOverdue ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {formatDate(ev.dueDate)}
                    </p>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      isPaid ? "bg-green-100 text-green-700" :
                      isOverdue ? "bg-red-100 text-red-700" :
                      ev.isPredicted ? "bg-purple-100 text-purple-700" :
                      "bg-amber-100 text-amber-700"
                    )}>
                      {isPaid ? "Zaplaceno" : isOverdue ? "Po splatnosti" : ev.isPredicted ? "Prognóza" : "Nadcházející"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
