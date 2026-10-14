import type { ParsedStatement, ParsedTransaction } from "./types";
import { czAmount } from "./kb-pdf";
import { assertBalance, assertCounts, compactIban, idCounter, isoFromCz, symbol, withBankCode } from "./statement-utils";

/**
 * CSV export z MojeBanky (Komerční banka): „MojeBanka, export transakční historie“.
 * Kódování windows-1250, oddělovač „;“, nahoře hlavička s účtem a zůstatky, pak tabulka pohybů.
 */

export function decodeCsv(buf: Buffer): string {
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return new TextDecoder("windows-1250").decode(buf);
}

export function looksLikeKbCsv(text: string): boolean {
  return /MojeBanka/i.test(text.slice(0, 300)) || (/"Datum splatnosti"/.test(text) && /"Identifikace transakce"/.test(text));
}

/** Řádek CSV s „;“ a uvozovkami ("" = uvozovka uvnitř). */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\u00a0/g, " ").trim());
}

export function parseKbCsv(text: string): ParsedStatement {
  if (!looksLikeKbCsv(text)) throw new Error("Soubor není CSV export z MojeBanky");
  const rows = text.split(/\r?\n/).map(splitRow);
  const headIdx = rows.findIndex((r) => r[0] === "Datum splatnosti");
  if (headIdx < 0) throw new Error("KB CSV: nenalezena tabulka pohybů");

  const meta = new Map<string, string[]>();
  let lastKey = "";
  for (const r of rows.slice(0, headIdx)) {
    if (r[0]) { lastKey = r[0]; meta.set(lastKey, r.slice(1).filter(Boolean)); }
    else if (lastKey && r[1]) meta.get(lastKey)!.push(r[1]); // pokračování hodnoty (druhé datum období)
  }
  const get = (k: string) => meta.get(k)?.[0] ?? null;
  const num = (k: string) => { const v = get(k); return v ? czAmount(v) : null; };

  const [accRaw, accCur] = (get("Číslo účtu") || "").split(/\s+/);
  const currency = (accCur || "CZK").toUpperCase();
  const period = meta.get("Výpis za období") || meta.get("Za období") || [];

  const head = rows[headIdx];
  const col = (name: string) => head.indexOf(name);
  const c = {
    date: col("Datum splatnosti"), acc: col("Protiúčet a kód banky"), name: col("Název protiúčtu"), amount: col("Částka"),
    vs: col("VS"), ks: col("KS"), ss: col("SS"), ident: col("Identifikace transakce"),
    sys: col("Systémový popis"), payer: col("Popis příkazce"), payee: col("Popis pro příjemce"),
  };
  const av = head.map((h, i) => (h.startsWith("AV pole") ? i : -1)).filter((i) => i >= 0);
  if (c.date < 0 || c.amount < 0) throw new Error("KB CSV: chybí sloupec data nebo částky");

  const nextId = idCounter();
  const transactions: ParsedTransaction[] = [];
  for (const r of rows.slice(headIdx + 1)) {
    const date = isoFromCz(r[c.date]);
    if (!date || !r[c.amount]) continue;
    const amount = czAmount(r[c.amount].replace(/^\+/, ""));
    const ident = r[c.ident] || null;
    const account = r[c.acc] || null;
    const vs = symbol(r[c.vs]);
    const parts = [r[c.sys], r[c.payer], r[c.payee], ...av.map((i) => r[i])].map((s) => (s || "").trim()).filter(Boolean);
    const message = [...new Set(parts)].join(" | ");
    const key = ident || `${account || ""}|${[vs, symbol(r[c.ks]), symbol(r[c.ss])].join("/")}|${message}`;
    transactions.push({
      date,
      amount,
      currency,
      counterpartyName: r[c.name] || null,
      counterpartyAccount: account,
      variableSymbol: vs,
      constantSymbol: symbol(r[c.ks]),
      specificSymbol: symbol(r[c.ss]),
      message,
      externalId: nextId(`kb:${date}:${key}:${amount.toFixed(2)}`),
    });
  }

  const st: ParsedStatement = {
    iban: compactIban(get("IBAN")),
    accountNumber: withBankCode(accRaw, "0100"),
    currency,
    openingBalance: num("Počáteční zůstatek"),
    closingBalance: num("Konečný zůstatek"),
    periodFrom: isoFromCz(period[0]),
    periodTo: isoFromCz(period[1] ?? period[0]),
    transactions,
    bank: "Komerční banka",
    accountName: get("Název účtu"),
  };
  assertBalance("KB CSV", st);
  const count = get("Počet položek");
  assertCounts("KB CSV", st, null, null, count && /^\d+$/.test(count) ? Number(count) : null);
  return st;
}
