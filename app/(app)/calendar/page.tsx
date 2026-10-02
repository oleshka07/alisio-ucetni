export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtDate } from "@/lib/format";
import { settingsFromProfile } from "@/lib/tax/sync";
import ActionButton from "@/components/finance/ActionButton";
import TaxSettingsForm, { type TaxSettingsValue } from "@/components/finance/TaxSettingsForm";
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw } from "lucide-react";

type SP = Promise<{ clientId?: string; show?: string }>;
const WEEKDAY = ["ne", "po", "út", "st", "čt", "pá", "so"];
const MONTH = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const showDone = sp.show === "all";
  const companies = await prisma.client.findMany({ where: { isActive: true }, include: { companyProfile: true }, orderBy: { createdAt: "asc" } });
  const selected = companies.find((c) => c.id === sp.clientId) ?? (companies.length === 1 ? companies[0] : null);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const events = await prisma.taxEvent.findMany({
    where: {
      ...(sp.clientId ? { clientId: sp.clientId } : {}),
      ...(showDone ? {} : { OR: [{ status: "upcoming" }, { doneAt: { gte: new Date(now.getTime() - 14 * 86400_000) } }] }),
      status: { not: "cancelled" },
      dueDate: { lte: new Date(now.getTime() + 125 * 86400_000) },
    },
    include: { client: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
  });
  const overdue = events.filter((e) => e.status === "upcoming" && e.dueDate < todayUtc);
  const upcoming = events.filter((e) => !(e.status === "upcoming" && e.dueDate < todayUtc));
  const byMonth = new Map<string, typeof events>();
  for (const e of upcoming) {
    const k = `${e.dueDate.getUTCFullYear()}-${e.dueDate.getUTCMonth()}`;
    byMonth.set(k, [...(byMonth.get(k) || []), e]);
  }
  const notConfigured = companies.filter((c) => !settingsFromProfile(c, c.companyProfile) || !c.companyProfile?.dic);
  const p = selected?.companyProfile;
  const settings: TaxSettingsValue | null = selected
    ? {
        taxCalendar: p?.taxCalendar ?? true,
        taxEntity: (p?.taxEntity as "legal" | "osvc") || (selected.type === "person" ? "osvc" : "legal"),
        dic: p?.dic || "",
        vatPayer: p?.vatPayer ?? false,
        vatPeriod: p?.vatPeriod === "quarterly" ? "quarterly" : "monthly",
        euSupplies: p?.euSupplies ?? false,
        hasEmployees: p?.hasEmployees ?? false,
        hasWithholding: p?.hasWithholding ?? false,
        incomeTaxFiling: (p?.incomeTaxFiling as TaxSettingsValue["incomeTaxFiling"]) || "standard",
        incomeTaxAdvances: (p?.incomeTaxAdvances as TaxSettingsValue["incomeTaxAdvances"]) || "none",
        flatTax: p?.flatTax ?? false,
        roadTaxVehicles: p?.roadTaxVehicles ?? false,
        ownsRealEstate: p?.ownsRealEstate ?? false,
        propertyTaxSplit: p?.propertyTaxSplit ?? false,
      }
    : null;
  const qs = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    Object.entries({ clientId: sp.clientId, show: sp.show, ...patch }).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const chip = (a: boolean) => (a ? "px-3 py-1 rounded-md bg-primary text-primary-foreground" : "px-3 py-1 rounded-md border border-border hover:bg-accent");

  const Row = ({ e }: { e: (typeof events)[number] }) => {
    const late = e.status === "upcoming" && e.dueDate < todayUtc;
    const done = e.status === "done" || e.status === "paid";
    const days = Math.round((e.dueDate.getTime() - todayUtc.getTime()) / 86400_000);
    return (
      <li className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5 border-t border-border first:border-t-0", done && "opacity-60")}>
        <div className={cn("w-14 text-center shrink-0 rounded-md py-1", late ? "bg-red-50 text-red-700" : days <= 7 && !done ? "bg-amber-50 text-amber-700" : "bg-muted")}>
          <div className="text-lg font-bold leading-none">{e.dueDate.getUTCDate()}.</div>
          <div className="text-[10px] uppercase">{WEEKDAY[e.dueDate.getUTCDay()]} {e.dueDate.getUTCMonth() + 1}.</div>
        </div>
        <div className="flex-1 min-w-[14rem]">
          <p className={cn("text-sm font-medium", done && "line-through")}>{e.title}</p>
          <p className="text-xs text-muted-foreground">
            {[!sp.clientId && companies.length > 1 && e.client.name, e.files && "podat", e.pays && "zaplatit", e.note].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {e.amount != null && e.amount > 0 && <span className="text-sm tabular-nums">{fmtAmount(e.amount, e.currency, false)}</span>}
          {e.status === "paid" && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{e.paidTransactionId ? "zaplaceno (výpis)" : "zaplaceno"}</span>}
          {e.status === "done" && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />hotovo</span>}
          {e.status === "upcoming" ? (
            <ActionButton url={`/api/tax-events/${e.id}`} method="PATCH" body={{ status: e.pays ? "paid" : "done" }} className="px-2 py-1 text-xs" success="Označeno">
              <CheckCircle2 className="w-3.5 h-3.5" /> {e.pays ? "Zaplaceno" : "Hotovo"}
            </ActionButton>
          ) : (
            <ActionButton url={`/api/tax-events/${e.id}`} method="PATCH" body={{ status: "upcoming" }} variant="ghost" className="px-1.5" title="Vrátit mezi nesplněné">
              <RotateCcw className="w-3.5 h-3.5" />
            </ActionButton>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daňový kalendář</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Termíny se počítají automaticky podle nastavení firmy, posouvají se na pracovní den a platby daní z výpisu se označí samy.
          </p>
        </div>
        <ActionButton url="/api/cron/tax-calendar" success="Kalendář přepočítán">
          <RefreshCw className="w-3.5 h-3.5" /> Přepočítat
        </ActionButton>
      </div>

      {notConfigured.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          Doplňte daňový profil (DIČ, DPH…):{" "}
          {notConfigured.map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link href={qs({ clientId: c.id })} className="underline font-medium">{c.name}</Link></span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 text-sm">
        {companies.length > 1 && (
          <>
            <Link href={qs({ clientId: undefined })} className={chip(!sp.clientId)}>Všechny firmy</Link>
            {companies.map((c) => <Link key={c.id} href={qs({ clientId: c.id })} className={chip(sp.clientId === c.id)}>{c.name}</Link>)}
          </>
        )}
        <Link href={qs({ show: showDone ? undefined : "all" })} className={cn(chip(showDone), "ml-auto")}>{showDone ? "Skrýt splněné" : "Zobrazit i splněné"}</Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          {overdue.length > 0 && (
            <section className="bg-card border border-red-200 rounded-xl overflow-hidden">
              <h2 className="px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Po termínu</h2>
              <ul>{overdue.map((e) => <Row key={e.id} e={e} />)}</ul>
            </section>
          )}
          {[...byMonth.entries()].map(([k, list]) => {
            const [y, m] = k.split("-").map(Number);
            return (
              <section key={k} className="bg-card border border-border rounded-xl overflow-hidden">
                <h2 className="px-4 py-2 text-sm font-semibold bg-muted/40 capitalize">{MONTH[m]} {y}</h2>
                <ul>{list.map((e) => <Row key={e.id} e={e} />)}</ul>
              </section>
            );
          })}
          {events.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
              Žádné termíny. Vyberte firmu a nastavte její daňový profil — termíny se vygenerují hned.
            </div>
          )}
        </div>

        <aside className="bg-card border border-border rounded-xl p-4 space-y-3">
          {selected && settings ? (
            <>
              <h2 className="font-semibold text-sm">Daňový profil: {selected.name}</h2>
              <TaxSettingsForm key={selected.id} clientId={selected.id} value={settings} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Vyberte firmu nahoře a nastavte její daňový profil.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
