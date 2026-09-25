import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { Landmark, Inbox, MessageSquareWarning, BellRing } from "lucide-react";

/** Блок на «Přehled»: що бракує, запити бухгалтера, дедлайни (датові схранки). */
export default async function FinanceSummary() {
  const now = new Date();
  const [missing, unassigned, openReq, urgent] = await Promise.all([
    prisma.transaction.count({ where: { docStatus: { in: ["missing", "partial"] } } }),
    prisma.document.count({ where: { links: { none: {} }, task: null } }),
    prisma.documentRequest.count({ where: { status: "open" } }),
    prisma.task.findMany({
      where: { status: { in: ["pending", "in_progress"] }, OR: [{ source: "databox" }, { dueDate: { lte: new Date(now.getTime() + 14 * 86400_000) } }] },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  const tiles = [
    { href: "/transactions?status=open", label: "Platby bez dokladů", value: missing, icon: Landmark, warn: missing > 0 },
    { href: "/inbox", label: "Nepřiřazené doklady", value: unassigned, icon: Inbox, warn: false },
    { href: "/transactions?status=open", label: "Požadavky účetní", value: openReq, icon: MessageSquareWarning, warn: openReq > 0 },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
            <t.icon className={t.warn ? "w-5 h-5 text-amber-500" : "w-5 h-5 text-muted-foreground"} />
            <p className="text-2xl font-bold mt-2">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.label}</p>
          </Link>
        ))}
      </div>
      <section className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><BellRing className="w-4 h-4" /> Nezapomenout</h2>
        {urgent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">Nic naléhavého</p>
        ) : (
          <ul className="space-y-1.5">
            {urgent.map((t) => {
              const overdue = t.dueDate && t.dueDate < now;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/tasks/${t.id}`} className="truncate hover:text-primary">{t.title}</Link>
                  <span className={overdue ? "text-xs text-red-600 whitespace-nowrap" : "text-xs text-muted-foreground whitespace-nowrap"}>{fmtDate(t.dueDate)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
