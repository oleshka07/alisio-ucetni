"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Plug, Trash2, Send, Upload } from "lucide-react";
import ActionButton from "@/components/finance/ActionButton";
import FileDrop from "@/components/finance/FileDrop";
import { CATEGORIES, DOC_TYPES } from "@/lib/docs/types";
import { cn } from "@/lib/utils";

// ─── Спільне ─────────────────────────────────────────────────────────────────

type Client = { id: string; name: string; type?: string };

const input = "w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background";
const label = "block text-xs font-medium text-muted-foreground mb-1";

function Section({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      {children}
    </label>
  );
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
  return data;
}

function useForm<T extends Record<string, unknown>>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const set = (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  return { v, setV, set };
}

function SubmitBtn({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {children}
    </button>
  );
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("cs-CZ") : "nikdy";
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export function TelegramPanel({ enabled, linked, isOwner }: { enabled: boolean; linked: boolean; isOwner: boolean }) {
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/link");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Telegram"
      desc="Připomínky chybějících dokladů, požadavky účetní, datové schránky. Doklady lze do bota posílat fotkou nebo PDF."
    >
      {!enabled ? (
        <p className="text-sm text-amber-700">Bot není nastaven — na serveru chybí TELEGRAM_BOT_TOKEN.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("text-sm", linked ? "text-emerald-600" : "text-muted-foreground")}>{linked ? "✓ Váš Telegram je připojen" : "Telegram není připojen"}</span>
          <button onClick={connect} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50">
            <Send className="w-3.5 h-3.5" /> {linked ? "Připojit znovu" : "Připojit Telegram"}
          </button>
          {isOwner && (
            <>
              <ActionButton url="/api/telegram/setup" success="Webhook nastaven">
                <Plug className="w-3.5 h-3.5" /> Nastavit webhook
              </ActionButton>
              <ActionButton url="/api/cron/digest" success="Přehled odeslán">Poslat přehled teď</ActionButton>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Банківські рахунки ──────────────────────────────────────────────────────

type Account = {
  id: string; clientId: string; name: string; accountNumber: string | null; iban: string | null; currency: string; isActive: boolean;
  source: string; imapHost: string | null; imapPort: number | null; imapUser: string | null; imapFolder: string | null;
  senderFilter: string | null; lastSyncAt: string | null; lastError: string | null; hasPassword: boolean; hasToken: boolean;
};

const EMPTY_ACCOUNT = {
  clientId: "", name: "", accountNumber: "", iban: "", currency: "CZK", source: "imap_camt",
  imapHost: "", imapPort: "993", imapUser: "", imapPassword: "", imapFolder: "INBOX", senderFilter: "", fioToken: "",
};

function AccountForm({ clients, initial, id, onDone }: { clients: Client[]; initial?: Partial<typeof EMPTY_ACCOUNT>; id?: string; onDone: () => void }) {
  const router = useRouter();
  const { v, set } = useForm({ ...EMPTY_ACCOUNT, clientId: clients[0]?.id || "", ...initial });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send(id ? `/api/bank-accounts/${id}` : "/api/bank-accounts", id ? "PATCH" : "POST", v);
      toast.success("Uloženo");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 border border-border rounded-lg p-4 bg-muted/20">
      <Field l="Firma">
        <select value={v.clientId} onChange={set("clientId")} className={input} disabled={!!id}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field l="Název (např. KB běžný)"><input value={v.name} onChange={set("name")} className={input} required /></Field>
      <Field l="Číslo účtu (123456789/0100)"><input value={v.accountNumber} onChange={set("accountNumber")} className={input} /></Field>
      <Field l="IBAN"><input value={v.iban} onChange={set("iban")} className={input} /></Field>
      <Field l="Zdroj výpisů">
        <select value={v.source} onChange={set("source")} className={input}>
          <option value="imap_camt">E-mail (CAMT.053 XML) — KB, ČS, …</option>
          <option value="fio_api">Fio API (token)</option>
          <option value="manual">Jen ruční nahrání</option>
        </select>
      </Field>
      <Field l="Měna"><input value={v.currency} onChange={set("currency")} className={input} /></Field>
      {v.source === "imap_camt" && (
        <>
          <Field l="IMAP server (např. imap.gmail.com)"><input value={v.imapHost} onChange={set("imapHost")} className={input} /></Field>
          <Field l="Port"><input value={v.imapPort} onChange={set("imapPort")} className={input} /></Field>
          <Field l="Uživatel (vypisy@swipescape.eu)"><input value={v.imapUser} onChange={set("imapUser")} className={input} autoComplete="off" /></Field>
          <Field l={id ? "Heslo (prázdné = beze změny)" : "Heslo / heslo aplikace"}><input type="password" value={v.imapPassword} onChange={set("imapPassword")} className={input} autoComplete="new-password" /></Field>
          <Field l="Složka"><input value={v.imapFolder} onChange={set("imapFolder")} className={input} /></Field>
          <Field l="Odesílatel obsahuje (volitelné, např. kb.cz|csas.cz)"><input value={v.senderFilter} onChange={set("senderFilter")} className={input} /></Field>
        </>
      )}
      {v.source === "fio_api" && (
        <Field l={id ? "Fio token (prázdné = beze změny)" : "Fio token (jen pro čtení)"}><input type="password" value={v.fioToken} onChange={set("fioToken")} className={input} autoComplete="new-password" /></Field>
      )}
      <div className="sm:col-span-2 flex gap-2">
        <SubmitBtn busy={busy}>Uložit</SubmitBtn>
        <button type="button" onClick={onDone} className="text-sm px-3 py-1.5 text-muted-foreground">Zrušit</button>
      </div>
    </form>
  );
}

export function BankAccountsPanel({ clients, accounts, isOwner }: { clients: Client[]; accounts: Account[]; isOwner: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Section
      title="Bankovní účty"
      desc="Výpisy chodí e-mailem (CAMT.053) nebo přes Fio API. Každá platba se objeví v „Platby a doklady“."
      action={isOwner && !adding ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm text-primary whitespace-nowrap shrink-0"><Plus className="w-4 h-4" /> Přidat účet</button>
      ) : undefined}
    >
      {adding && <AccountForm clients={clients} onDone={() => setAdding(false)} />}
      {accounts.length === 0 && !adding && <p className="text-sm text-muted-foreground">Zatím žádný účet.</p>}
      <div className="space-y-3">
        {accounts.map((a) => (
          <div key={a.id} className={cn("border border-border rounded-lg p-4", !a.isActive && "opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{a.name} <span className="text-xs text-muted-foreground">{a.accountNumber || a.iban || ""}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.source === "imap_camt" ? `E-mail ${a.imapUser || "—"} / ${a.imapFolder}` : a.source === "fio_api" ? "Fio API" : "Ruční import"}
                  {" · "}poslední synchronizace: {when(a.lastSyncAt)}
                </p>
                {a.lastError && <p className="text-xs text-red-600 mt-1">{a.lastError}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {a.source !== "manual" && (
                  <ActionButton url={`/api/bank-accounts/${a.id}/sync`} className="text-xs px-2 py-1" onDone={(d) => {
                    const r = d as { ok: boolean; imported: number; error?: string; matchedDocuments?: number };
                    if (r.ok) toast.success(`Nových plateb: ${r.imported}${r.matchedDocuments ? ` · přiřazeno dokladů: ${r.matchedDocuments}` : ""}`);
                    else toast.error(r.error || "Chyba");
                  }}>
                    <RefreshCw className="w-3.5 h-3.5" /> Načíst
                  </ActionButton>
                )}
                {isOwner && a.source === "imap_camt" && (
                  <ActionButton url={`/api/bank-accounts/${a.id}/test`} className="text-xs px-2 py-1" onDone={(d) => {
                    const r = d as { ok: boolean; messages?: number; error?: string };
                    if (r.ok) toast.success(`Připojení OK · zpráv ve složce: ${r.messages}`);
                    else toast.error(r.error || "Nepodařilo se připojit");
                  }}>Test</ActionButton>
                )}
                {isOwner && (
                  <button onClick={() => setEditing(editing === a.id ? null : a.id)} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent">Upravit</button>
                )}
                {isOwner && (
                  <ActionButton url={`/api/bank-accounts/${a.id}`} method="PATCH" body={{ isActive: !a.isActive }} variant="ghost" className="text-xs px-2 py-1">
                    {a.isActive ? "Vypnout" : "Zapnout"}
                  </ActionButton>
                )}
              </div>
            </div>
            {editing === a.id && (
              <div className="mt-3">
                <AccountForm
                  clients={clients}
                  id={a.id}
                  initial={{
                    clientId: a.clientId, name: a.name, accountNumber: a.accountNumber || "", iban: a.iban || "", currency: a.currency,
                    source: a.source, imapHost: a.imapHost || "", imapPort: String(a.imapPort || 993), imapUser: a.imapUser || "",
                    imapFolder: a.imapFolder || "INBOX", senderFilter: a.senderFilter || "",
                  }}
                  onDone={() => setEditing(null)}
                />
              </div>
            )}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer inline-flex items-center gap-1"><Upload className="w-3 h-3" /> Nahrát výpis ručně (CAMT.053 XML)</summary>
              <div className="mt-2"><FileDrop url={`/api/bank-accounts/${a.id}/upload`} compact accept=".xml" label="Soubor výpisu .xml" /></div>
            </details>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Поштові скриньки (документи / ISDS) ──────────────────────────────────────

type Inbox = {
  id: string; name: string; kind: string; clientId: string | null; imapHost: string; imapPort: number; imapUser: string;
  imapFolder: string; senderFilter: string | null; isActive: boolean; lastSyncAt: string | null; lastError: string | null;
};

const KIND: Record<string, string> = {
  mixed: "Hlavní pošta: datové schránky + faktury",
  documents: "Jen doklady (všechny přílohy)",
  databox: "Jen oznámení datových schránek",
};

export function InboxesPanel({ clients, inboxes, isOwner }: { clients: Client[]; inboxes: Inbox[]; isOwner: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const { v, set, setV } = useForm({ name: "", kind: "mixed", clientId: "", imapHost: "", imapPort: "993", imapUser: "", imapPassword: "", imapFolder: "INBOX", senderFilter: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/api/doc-inboxes", "POST", v);
      toast.success("Schránka přidána");
      setAdding(false);
      setV((p) => ({ ...p, imapPassword: "" }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="E-mailové schránky"
      desc="Hlavní pošta: oznámení z datových schránek → úkoly s termínem; faktury v přílohách → automaticky k platbám. Ostatní e-maily se nečtou."
      action={isOwner && !adding ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm text-primary whitespace-nowrap shrink-0"><Plus className="w-4 h-4" /> Přidat schránku</button>
      ) : undefined}
    >
      {adding && (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 border border-border rounded-lg p-4 bg-muted/20">
          <Field l="Režim">
            <select value={v.kind} onChange={set("kind")} className={input}>
              {Object.entries(KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Field>
          <Field l="Název"><input value={v.name} onChange={set("name")} className={input} placeholder="Hlavní pošta" /></Field>
          <Field l="Firma pro nerozpoznané doklady">
            <select value={v.clientId} onChange={set("clientId")} className={input}>
              <option value="">— podle IČO / první firma —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field l="IMAP server"><input value={v.imapHost} onChange={set("imapHost")} className={input} required /></Field>
          <Field l="Port"><input value={v.imapPort} onChange={set("imapPort")} className={input} /></Field>
          <Field l="Uživatel"><input value={v.imapUser} onChange={set("imapUser")} className={input} required autoComplete="off" /></Field>
          <Field l="Heslo / heslo aplikace"><input type="password" value={v.imapPassword} onChange={set("imapPassword")} className={input} required autoComplete="new-password" /></Field>
          <Field l="Složka"><input value={v.imapFolder} onChange={set("imapFolder")} className={input} /></Field>
          <div className="sm:col-span-2 flex gap-2">
            <SubmitBtn busy={busy}>Uložit</SubmitBtn>
            <button type="button" onClick={() => setAdding(false)} className="text-sm px-3 py-1.5 text-muted-foreground">Zrušit</button>
          </div>
        </form>
      )}
      {inboxes.length === 0 && !adding && <p className="text-sm text-muted-foreground">Zatím žádná schránka.</p>}
      <div className="space-y-2">
        {inboxes.map((i) => (
          <div key={i.id} className={cn("border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3", !i.isActive && "opacity-60")}>
            <div>
              <p className="font-medium text-sm">{i.name} <span className="text-xs text-muted-foreground">{i.imapUser}</span></p>
              <p className="text-xs text-muted-foreground">{KIND[i.kind] || i.kind} · poslední kontrola: {when(i.lastSyncAt)}</p>
              {i.lastError && <p className="text-xs text-red-600 mt-1">{i.lastError}</p>}
            </div>
            <div className="flex gap-2">
              <ActionButton url={`/api/doc-inboxes/${i.id}/sync`} className="text-xs px-2 py-1" onDone={(d) => {
                const r = d as { ok: boolean; documents: number; autoLinked: number; databox: number; error?: string };
                if (r.ok) toast.success(`Doklady: ${r.documents} (přiřazeno ${r.autoLinked}) · datové schránky: ${r.databox}`);
                else toast.error(r.error || "Chyba");
              }}>
                <RefreshCw className="w-3.5 h-3.5" /> Zkontrolovat
              </ActionButton>
              {isOwner && (
                <ActionButton url={`/api/doc-inboxes/${i.id}`} method="PATCH" body={{ isActive: !i.isActive }} variant="ghost" className="text-xs px-2 py-1">
                  {i.isActive ? "Vypnout" : "Zapnout"}
                </ActionButton>
              )}
              {isOwner && (
                <ActionButton url={`/api/doc-inboxes/${i.id}`} method="DELETE" variant="ghost" confirm="Smazat schránku?" className="text-xs px-2 py-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </ActionButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Правила документів ──────────────────────────────────────────────────────

type Rule = {
  id: string; name: string; clientId: string | null; priority: number; isActive: boolean; direction: string;
  counterpartyContains: string | null; accountContains: string | null; messageContains: string | null;
  minAbsAmount: number | null; maxAbsAmount: number | null; category: string | null; requiredDocs: string[];
  notNeeded: boolean; hint: string | null; isSystem: boolean;
};

export function RulesPanel({ rules, clients, isOwner }: { rules: Rule[]; clients: Client[]; isOwner: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const { v, set, setV } = useForm({
    name: "", clientId: "", priority: "50", direction: "out", counterpartyContains: "", accountContains: "", messageContains: "",
    minAbsAmount: "", category: "supplier", notNeeded: false, hint: "", requiredDocs: ["invoice_in"] as string[],
  });

  function toggleDoc(t: string) {
    setV((p) => ({ ...p, requiredDocs: p.requiredDocs.includes(t) ? p.requiredDocs.filter((x) => x !== t) : [...p.requiredDocs, t] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/api/rules", "POST", v);
      toast.success("Pravidlo přidáno — použijte „Přepočítat platby“");
      setAdding(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const dir = (d: string) => (d === "in" ? "příjem" : d === "out" ? "výdaj" : "vše");

  return (
    <Section
      title="Pravidla dokladů"
      desc="Která platba potřebuje které doklady. Platí první pravidlo podle priority (menší číslo = dříve)."
      action={isOwner ? (
        <div className="flex gap-2">
          <ActionButton url="/api/rules/reapply" className="text-xs px-2 py-1" onDone={(d) => toast.success(`Přepočítáno, změněno: ${(d as { changed: number }).changed}`)}>
            <RefreshCw className="w-3.5 h-3.5" /> Přepočítat platby
          </ActionButton>
          {!adding && <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm text-primary whitespace-nowrap shrink-0"><Plus className="w-4 h-4" /> Pravidlo</button>}
        </div>
      ) : undefined}
    >
      {adding && (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 border border-border rounded-lg p-4 bg-muted/20">
          <Field l="Název"><input value={v.name} onChange={set("name")} className={input} required placeholder="Import modulů z UA" /></Field>
          <Field l="Firma">
            <select value={v.clientId} onChange={set("clientId")} className={input}>
              <option value="">Všechny</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field l="Priorita"><input value={v.priority} onChange={set("priority")} className={input} /></Field>
          <Field l="Směr">
            <select value={v.direction} onChange={set("direction")} className={input}>
              <option value="out">Výdaj</option><option value="in">Příjem</option><option value="any">Vše</option>
            </select>
          </Field>
          <Field l="Protistrana nebo zpráva obsahuje (a|b)"><input value={v.counterpartyContains} onChange={set("counterpartyContains")} className={input} /></Field>
          <Field l="Protiúčet obsahuje"><input value={v.accountContains} onChange={set("accountContains")} className={input} /></Field>
          <Field l="Zpráva / VS obsahuje"><input value={v.messageContains} onChange={set("messageContains")} className={input} /></Field>
          <Field l="Minimální částka"><input value={v.minAbsAmount} onChange={set("minAbsAmount")} className={input} /></Field>
          <Field l="Kategorie">
            <select value={v.category} onChange={set("category")} className={input}>
              {Object.entries(CATEGORIES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Field>
          <Field l="Nápověda (co přesně nahrát)"><input value={v.hint} onChange={set("hint")} className={input} /></Field>
          <div className="sm:col-span-2">
            <span className={label}>Požadované doklady</span>
            <div className="flex flex-wrap gap-2">
              <label className="text-sm inline-flex items-center gap-1.5"><input type="checkbox" checked={v.notNeeded} onChange={set("notNeeded")} /> Doklad není potřeba</label>
              {!v.notNeeded && Object.entries(DOC_TYPES).map(([k, t]) => (
                <label key={k} className="text-sm inline-flex items-center gap-1.5 border border-border rounded px-2 py-0.5">
                  <input type="checkbox" checked={v.requiredDocs.includes(k)} onChange={() => toggleDoc(k)} /> {t.cs}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <SubmitBtn busy={busy}>Uložit</SubmitBtn>
            <button type="button" onClick={() => setAdding(false)} className="text-sm px-3 py-1.5 text-muted-foreground">Zrušit</button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium py-1.5 pr-3">#</th>
              <th className="text-left font-medium py-1.5 pr-3">Pravidlo</th>
              <th className="text-left font-medium py-1.5 pr-3">Podmínka</th>
              <th className="text-left font-medium py-1.5 pr-3">Doklady</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={cn("border-t border-border align-top", !r.isActive && "opacity-50")}>
                <td className="py-2 pr-3 text-muted-foreground">{r.priority}</td>
                <td className="py-2 pr-3">
                  {r.name}
                  {r.isSystem && <span className="ml-1 text-[10px] uppercase text-muted-foreground">systém</span>}
                  {r.clientId && <span className="block text-xs text-muted-foreground">{clients.find((c) => c.id === r.clientId)?.name}</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {[dir(r.direction), r.counterpartyContains && `„${r.counterpartyContains}“`, r.accountContains && `účet ${r.accountContains}`, r.messageContains && `zpráva „${r.messageContains}“`, r.maxAbsAmount && `≤ ${r.maxAbsAmount}`, r.minAbsAmount && `≥ ${r.minAbsAmount}`]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {r.notNeeded ? "není potřeba" : r.requiredDocs.map((d) => (DOC_TYPES as Record<string, { cs: string }>)[d]?.cs || d).join(", ")}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {isOwner && (
                    <ActionButton url={`/api/rules/${r.id}`} method="PATCH" body={{ isActive: !r.isActive }} variant="ghost" className="text-xs px-2 py-0.5">
                      {r.isActive ? "Vypnout" : "Zapnout"}
                    </ActionButton>
                  )}
                  {isOwner && !r.isSystem && (
                    <ActionButton url={`/api/rules/${r.id}`} method="DELETE" variant="ghost" confirm="Smazat pravidlo?" className="text-xs px-1.5 py-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ─── Користувачі ─────────────────────────────────────────────────────────────

type U = { id: string; email: string; name: string; role: string; isActive: boolean; telegramChatId: string | null; lastLoginAt: string | null };

export function UsersPanel({ users }: { users: U[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { v, set, setV } = useForm({ name: "", email: "", password: "", role: "accountant" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/api/users", "POST", v);
      toast.success("Uživatel vytvořen — pošlete mu e-mail a heslo");
      setV({ name: "", email: "", password: "", role: "accountant" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Uživatelé" desc="Účetní dostane vlastní přihlášení: vidí platby a doklady, může vyžádat doklad a označit kontrolu.">
      <table className="w-full text-sm">
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={cn("border-t border-border first:border-0", !u.isActive && "opacity-50")}>
              <td className="py-2 pr-3">{u.name}<span className="block text-xs text-muted-foreground">{u.email}</span></td>
              <td className="py-2 pr-3 text-xs">{u.role === "owner" ? "majitel" : "účetní"}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{u.telegramChatId ? "Telegram ✓" : ""} · přihlášen: {when(u.lastLoginAt)}</td>
              <td className="py-2 text-right">
                <ActionButton url={`/api/users/${u.id}`} method="PATCH" body={{ isActive: !u.isActive }} variant="ghost" className="text-xs px-2 py-0.5">
                  {u.isActive ? "Deaktivovat" : "Aktivovat"}
                </ActionButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={submit} className="grid sm:grid-cols-4 gap-2 items-end">
        <Field l="Jméno"><input value={v.name} onChange={set("name")} className={input} required /></Field>
        <Field l="E-mail"><input type="email" value={v.email} onChange={set("email")} className={input} required /></Field>
        <Field l="Heslo (min. 10 znaků)"><input type="text" value={v.password} onChange={set("password")} className={input} required minLength={10} autoComplete="off" /></Field>
        <div className="flex gap-2">
          <select value={v.role} onChange={set("role")} className={input}>
            <option value="accountant">Účetní</option>
            <option value="owner">Majitel</option>
          </select>
          <SubmitBtn busy={busy}>Přidat</SubmitBtn>
        </div>
      </form>
    </Section>
  );
}

// ─── Пароль ──────────────────────────────────────────────────────────────────

export function PasswordPanel() {
  const [busy, setBusy] = useState(false);
  const { v, set, setV } = useForm({ currentPassword: "", newPassword: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send("/api/users/me", "PATCH", v);
      toast.success("Heslo změněno");
      setV({ currentPassword: "", newPassword: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Změna hesla">
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-2 items-end">
        <Field l="Současné heslo"><input type="password" value={v.currentPassword} onChange={set("currentPassword")} className={input} autoComplete="current-password" /></Field>
        <Field l="Nové heslo (min. 10 znaků)"><input type="password" value={v.newPassword} onChange={set("newPassword")} className={input} autoComplete="new-password" /></Field>
        <div><SubmitBtn busy={busy}>Změnit</SubmitBtn></div>
      </form>
    </Section>
  );
}
