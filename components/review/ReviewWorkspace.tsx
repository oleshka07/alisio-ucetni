"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink, FileText, Link2, ScrollText, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtDate } from "@/lib/format";
import { docTypeLabel } from "@/lib/docs/types";
import StatusBadge from "@/components/finance/StatusBadge";
import FileDrop from "@/components/finance/FileDrop";

export type ReviewDoc = {
  id: string; name: string; mime: string; docType: string | null; amount: number | null; currency: string | null; date: string | null; counterparty: string | null;
};
export type ReviewTx = {
  id: string; accountId: string | null; date: string; amount: number; currency: string; counterparty: string | null; message: string | null;
  vs: string | null; docStatus: string; reviewed: boolean; method: string | null; hint: string | null; docs: ReviewDoc[];
};
export type ReviewAccount = {
  id: string; name: string; currency: string; number: string | null;
  statements: Array<{ id: string; fileName: string | null; hasFile: boolean; periodFrom: string | null; periodTo: string | null; opening: number | null; closing: number | null; isPdf: boolean }>;
  gaps: Array<{ from: string; to: string }>;
  issues: string[];
};

type Preview = { kind: "doc"; doc: ReviewDoc } | { kind: "statement"; id: string; name: string; isPdf: boolean } | null;

const isImage = (mime: string) => /^image\//.test(mime);

export default function ReviewWorkspace({ accounts, txs, unassigned }: { accounts: ReviewAccount[]; txs: ReviewTx[]; unassigned: ReviewDoc[] }) {
  const router = useRouter();
  // pořadí jako na obrazovce: po účtech, pak platby mimo banku
  const groups = useMemo(() => {
    const g = accounts.map((a) => ({ key: a.id, title: `${a.name}${a.number ? ` · ${a.number}` : ""}`, account: a as ReviewAccount | null, txs: txs.filter((t) => t.accountId === a.id) }));
    const other = txs.filter((t) => !t.accountId || !accounts.some((a) => a.id === t.accountId));
    if (other.length) g.push({ key: "other", title: "Platby mimo banku (hotově, soukromou kartou)", account: null, txs: other });
    return g;
  }, [accounts, txs]);
  const ordered = useMemo(() => groups.flatMap((g) => g.txs), [groups]);

  const [selId, setSelId] = useState<string | null>(ordered[0]?.id ?? null);
  const sel = ordered.find((t) => t.id === selId) ?? null;
  const [preview, setPreview] = useState<Preview>(sel?.docs[0] ? { kind: "doc", doc: sel.docs[0] } : null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const select = useCallback((t: ReviewTx | undefined) => {
    if (!t) return;
    setSelId(t.id);
    setPreview(t.docs[0] ? { kind: "doc", doc: t.docs[0] } : null);
    listRef.current?.querySelector(`[data-tx="${t.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, []);

  const act = useCallback(async (url: string, method: string, body: unknown, ok?: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
      if (ok) toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
      return false;
    } finally {
      setBusy(false);
    }
  }, [router]);

  const markReviewed = useCallback(async (t: ReviewTx, next: boolean) => {
    const done = await act(`/api/transactions/${t.id}`, "PATCH", { action: t.reviewed ? "unreviewed" : "reviewed" });
    if (done && next) {
      const i = ordered.findIndex((x) => x.id === t.id);
      select(ordered[i + 1]);
    }
  }, [act, ordered, select]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const i = ordered.findIndex((x) => x.id === selId);
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); select(ordered[Math.min(i + 1, ordered.length - 1)]); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); select(ordered[Math.max(i - 1, 0)]); }
      else if (e.key === "Enter" && sel && !busy) { e.preventDefault(); markReviewed(sel, true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selId, sel, busy, select, markReviewed]);

  const reviewed = txs.filter((t) => t.reviewed).length;
  const missing = txs.filter((t) => t.docStatus === "missing" || t.docStatus === "partial").length;
  const income = (cur: string) => txs.filter((t) => t.currency === cur && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = (cur: string) => txs.filter((t) => t.currency === cur && t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const currencies = [...new Set(txs.map((t) => t.currency))];

  return (
    <div className="space-y-4">
      {/* souhrn měsíce */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm bg-card border border-border rounded-xl px-4 py-3">
        <span><b>{txs.length}</b> plateb</span>
        <span className={missing ? "text-amber-700" : "text-emerald-700"}><b>{missing}</b> bez dokladu</span>
        <span><b>{reviewed}</b> / {txs.length} zkontrolováno</span>
        {currencies.map((c) => (
          <span key={c} className="text-muted-foreground">{c}: příjmy {fmtAmount(income(c), c, false)} · výdaje {fmtAmount(expense(c), c, false)}</span>
        ))}
        <span className="text-muted-foreground">{unassigned.length} nepřiřazených dokladů</span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        {/* seznam */}
        <div ref={listRef} className="bg-card border border-border rounded-xl overflow-hidden lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold">{g.title}</p>
                {g.account && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {g.account.statements.length === 0 && <span className="text-xs text-amber-700">Za tento měsíc žádný výpis</span>}
                    {g.account.statements.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!s.hasFile}
                        onClick={() => setPreview({ kind: "statement", id: s.id, name: s.fileName || "výpis", isPdf: s.isPdf })}
                        className={cn("inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border", preview?.kind === "statement" && preview.id === s.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent", !s.hasFile && "opacity-50")}
                        title={s.hasFile ? "Zobrazit výpis" : "Soubor výpisu není uložen"}
                      >
                        <ScrollText className="w-3 h-3" />
                        {s.periodFrom ? fmtDate(s.periodFrom) : "?"}–{s.periodTo ? fmtDate(s.periodTo) : "?"}
                        {s.closing != null && <span className="text-muted-foreground">· {fmtAmount(s.closing, g.account!.currency, false)}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {g.account && [...g.account.issues, ...g.account.gaps.map((x) => `Výpis chybí ${fmtDate(x.from)} – ${fmtDate(x.to)}`)].map((msg) => (
                  <p key={msg} className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1 mr-3"><AlertTriangle className="w-3 h-3" />{msg}</p>
                ))}
              </div>
              {g.txs.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Žádné platby</p>}
              {g.txs.map((t) => (
                <button
                  key={t.id}
                  data-tx={t.id}
                  type="button"
                  onClick={() => select(t)}
                  className={cn("w-full text-left px-3 py-2 border-b border-border/60 flex items-start gap-2", t.id === selId ? "bg-primary/10" : "hover:bg-accent/50")}
                >
                  <span
                    role="checkbox"
                    aria-checked={t.reviewed}
                    onClick={(e) => { e.stopPropagation(); markReviewed(t, false); }}
                    className="mt-0.5 shrink-0"
                    title={t.reviewed ? "Zkontrolováno — zrušit" : "Označit jako zkontrolované"}
                  >
                    {t.reviewed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium truncate">{t.counterparty || t.message || "—"}</span>
                      <span className={cn("text-sm tabular-nums whitespace-nowrap", t.amount > 0 ? "text-emerald-700" : "")}>{fmtAmount(t.amount, t.currency)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">{fmtDate(t.date)}{t.vs ? ` · VS ${t.vs}` : ""}{t.message && t.counterparty ? ` · ${t.message}` : ""}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {t.docs.length > 0 && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><FileText className="w-3 h-3" />{t.docs.length}</span>}
                        <StatusBadge status={t.docStatus} className="text-[10px] px-1.5" />
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {ordered.length === 0 && <p className="p-4 text-sm text-muted-foreground">Za tento měsíc žádné platby.</p>}
        </div>

        {/* detail + náhled */}
        <div className="space-y-3 lg:sticky lg:top-4">
          {sel && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{fmtDate(sel.date)}{sel.vs ? ` · VS ${sel.vs}` : ""}</p>
                  <p className={cn("text-xl font-bold tabular-nums", sel.amount > 0 && "text-emerald-700")}>{fmtAmount(sel.amount, sel.currency)}</p>
                  <p className="text-sm font-medium truncate">{sel.counterparty || "—"}</p>
                  {sel.message && <p className="text-xs text-muted-foreground break-words">{sel.message}</p>}
                  {sel.hint && sel.docStatus !== "complete" && sel.docStatus !== "not_needed" && <p className="text-xs text-amber-700 mt-1">{sel.hint}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button disabled={busy} onClick={() => markReviewed(sel, true)} className={cn("inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium", sel.reviewed ? "border border-border" : "bg-primary text-primary-foreground")}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {sel.reviewed ? "Zrušit kontrolu" : "Zkontrolováno ↵"}
                  </button>
                  {sel.docStatus !== "not_needed" && sel.docStatus !== "complete" && (
                    <button disabled={busy} onClick={() => act(`/api/transactions/${sel.id}`, "PATCH", { action: "not_needed" }, "Doklad není potřeba")} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent">
                      Doklad není potřeba
                    </button>
                  )}
                  <Link href={`/transactions/${sel.id}`} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent">
                    Detail / vyžádat <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sel.docs.map((d) => (
                  <button key={d.id} type="button" onClick={() => setPreview({ kind: "doc", doc: d })}
                    className={cn("inline-flex items-center gap-1 text-xs px-2 py-1 rounded border max-w-full", preview?.kind === "doc" && preview.doc.id === d.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent")}>
                    <FileText className="w-3 h-3 shrink-0" /><span className="truncate">{d.name}</span>
                    {d.docType && <span className="text-muted-foreground">· {docTypeLabel(d.docType)}</span>}
                  </button>
                ))}
                {sel.docs.length === 0 && <span className="text-xs text-muted-foreground">K platbě zatím není doklad.</span>}
              </div>
              <FileDrop url={`/api/transactions/${sel.id}/documents`} compact label="Přetáhněte doklad k této platbě" />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {preview ? (
              <>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border text-xs">
                  <span className="truncate font-medium">{preview.kind === "doc" ? preview.doc.name : `Výpis: ${preview.name}`}</span>
                  <a href={preview.kind === "doc" ? `/api/documents/${preview.doc.id}/file` : `/api/statements/${preview.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary shrink-0">
                    Otevřít <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {preview.kind === "doc" && isImage(preview.doc.mime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/documents/${preview.doc.id}/file`} alt={preview.doc.name} className="w-full max-h-[70vh] object-contain bg-muted" />
                ) : (preview.kind === "doc" ? preview.doc.mime === "application/pdf" : preview.isPdf) ? (
                  <iframe
                    key={preview.kind === "doc" ? preview.doc.id : preview.id}
                    src={`${preview.kind === "doc" ? `/api/documents/${preview.doc.id}/file` : `/api/statements/${preview.id}/file`}?view=1#view=FitH`}
                    className="w-full h-[70vh] bg-muted"
                    title="Náhled"
                  />
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">Náhled tohoto typu souboru není k dispozici — otevřete ho tlačítkem výše.</p>
                )}
              </>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Vyberte doklad nebo výpis k zobrazení.</p>
            )}
          </div>

          {/* nepřiřazené doklady */}
          {unassigned.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold">Nepřiřazené doklady firmy (kolem tohoto měsíce)</p>
              <ul className="space-y-1">
                {unassigned.map((d) => {
                  const match = sel && d.amount != null && Math.abs(Math.abs(sel.amount) - d.amount) < 0.01 && (!d.currency || d.currency === sel.currency);
                  return (
                    <li key={d.id} className={cn("flex items-center gap-2 text-xs rounded px-1.5 py-1", match && "bg-emerald-50")}>
                      <button type="button" onClick={() => setPreview({ kind: "doc", doc: d })} className="flex-1 min-w-0 text-left truncate hover:text-primary">
                        {d.counterparty || d.name}
                        <span className="text-muted-foreground"> · {d.date ? fmtDate(d.date) : "bez data"}{d.amount != null ? ` · ${fmtAmount(d.amount, d.currency || "CZK", false)}` : ""}</span>
                      </button>
                      {sel && (
                        <button type="button" disabled={busy} onClick={() => act(`/api/transactions/${sel.id}/link`, "POST", { documentId: d.id }, "Přiřazeno")}
                          className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border shrink-0", match ? "border-emerald-400 text-emerald-700" : "border-border hover:bg-accent")}
                          title="Přiřadit k vybrané platbě">
                          <Link2 className="w-3 h-3" /> k platbě
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
