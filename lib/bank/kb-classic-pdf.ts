import type { ParsedStatement, ParsedTransaction } from "./types";
import { toLines, czAmount, type Line, type PdfItem } from "./kb-pdf";
import { assertBalance, assertCounts, compactIban, czPeriod, idCounter, isoFromCz, symbol, withBankCode } from "./statement-utils";

/**
 * PDF výpis Komerční banky pro běžný účet („VÝPIS PERIODICKÝ“, starší rozložení):
 * malými písmeny „Počáteční zůstatek:“, data d.m.rrrr, jedna sloupec částky se znaménkem.
 * Řádky operace: typ | (zpráva…) | název protiúčtu | protiúčet | identifikace transakce.
 */

const AMOUNT = /^[+-]?\d{1,3}(?:[  ]\d{3})*,\d{2}$/;
const DATE = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
const IDENT = /^\d{3}-\d{8}\s+\S+$/;
const ACCOUNT = /^(?:(?:\d{1,6}-)?\d{2,10}\/\d{4}|[A-Z]{2}\d{2}[A-Z0-9]{10,30})$/;

export function looksLikeKbClassicPdf(items: PdfItem[]): boolean {
  const all = items.map((i) => i.str).join(" ");
  return /KOMBCZPP|Komerční banka/i.test(all) && /Počáteční zůstatek:/.test(all) && /Datum splatnosti/.test(all) && /k účtu:/.test(all);
}

function valueAfter(lines: Line[], label: string): string | null {
  for (const l of lines) {
    const i = l.items.findIndex((it) => it.str === label);
    if (i >= 0 && l.items[i + 1]) return l.items[i + 1].str;
  }
  return null;
}

function amountAfter(lines: Line[], label: string): number | null {
  const l = lines.find((x) => x.items.some((i) => i.str.startsWith(label)));
  const it = l?.items.find((i) => i.x < 300 && AMOUNT.test(i.str));
  return it ? czAmount(it.str) : null;
}

interface Entry {
  page: number;
  y: number;
  date: string;
  amount: number;
  texts: string[];
  symbols: Array<string | null>;
}

export function parseKbClassicItems(items: PdfItem[]): ParsedStatement {
  if (!looksLikeKbClassicPdf(items)) throw new Error("Soubor není PDF výpis Komerční banky");
  const lines = toLines(items);

  const accountNumber = withBankCode(valueAfter(lines, "k účtu:"), "0100");
  const iban = compactIban(valueAfter(lines, "IBAN:"));
  const currency = (valueAfter(lines, "měna:") || "CZK").toUpperCase();
  const [periodFrom, periodTo] = czPeriod(valueAfter(lines, "za období:"));
  const openingBalance = amountAfter(lines, "Počáteční zůstatek");
  const closingBalance = amountAfter(lines, "Konečný zůstatek");
  if (openingBalance == null || closingBalance == null) throw new Error("KB PDF: nenalezen počáteční nebo konečný zůstatek");
  const ownerLine = lines.find((l) => l.text.startsWith("Počáteční zůstatek"));
  const accountName = ownerLine?.items.find((i) => i.x > 300)?.str ?? null;

  const entries: Entry[] = [];
  for (const p of [...new Set(lines.map((l) => l.page))]) {
    const pageLines = lines.filter((l) => l.page === p);
    const head = pageLines.find((l) => l.items.some((i) => i.str === "Datum splatnosti"));
    const all = pageLines.flatMap((l) => l.items);
    const near = (s: string) => all.find((i) => i.str === s && head && Math.abs(i.y - head.y) < 40);
    const descX = near("Popis platby")?.x ?? 170;
    const vsX = near("VS")?.x ?? 375;
    const amountX = (near("Připsáno")?.x ?? 500) - 30;
    const headBottom = head ? Math.min(...all.filter((i) => i.y <= head.y && i.y >= head.y - 40).map((i) => i.y)) : Infinity;
    let started = false;
    for (const l of pageLines) {
      if (l.y >= headBottom - 1 || l.y < 70) continue;
      if (/^Komerční banka, a\.s\., se sídlem|^Vytištěno dne/.test(l.text)) break;
      const dateItem = l.items.find((i) => i.x < descX && DATE.test(i.str));
      const amountItem = l.items.find((i) => i.x >= amountX && AMOUNT.test(i.str));
      if (dateItem && amountItem) {
        entries.push({ page: p, y: l.y, date: isoFromCz(dateItem.str)!, amount: czAmount(amountItem.str), texts: [], symbols: [null, null, null] });
        started = true;
      }
      const cur = entries[entries.length - 1];
      if (!started || !cur) continue;
      const texts: string[] = [];
      for (const it of l.items) {
        if (it === amountItem || it.x < descX || it.x >= amountX) continue;
        if (/^\d{1,10}$/.test(it.str) && it.x + it.w > vsX - 5) {
          const k = Math.round((cur.y - l.y) / 9.6); // VS / KS / SS pod sebou
          if (k >= 0 && k <= 2) cur.symbols[k] = symbol(it.str);
        } else texts.push(it.str);
      }
      if (texts.length) cur.texts.push(texts.join(" "));
    }
  }

  const nextId = idCounter();
  const transactions: ParsedTransaction[] = entries.map((e) => {
    const [type, ...rest] = e.texts;
    const ident = rest.find((t) => IDENT.test(t)) || null;
    const account = rest.find((t) => ACCOUNT.test(t)) || null;
    const texts = rest.filter((t) => t !== ident && t !== account);
    // název protiúčtu je poslední text před protiúčtem / identifikací
    const name = texts.length >= 2 ? texts[texts.length - 1] : null;
    const message = [type, ...(name ? texts.slice(0, -1) : texts)].filter(Boolean);
    const key = ident || `${account || ""}|${e.symbols.join("/")}|${message.join(" | ")}`;
    return {
      date: e.date,
      amount: e.amount,
      currency,
      counterpartyName: name,
      counterpartyAccount: account,
      variableSymbol: e.symbols[0],
      constantSymbol: e.symbols[1],
      specificSymbol: e.symbols[2],
      message: [...new Set(message)].join(" | "),
      // stejné ID jako v CSV exportu z MojeBanky a v PDF „Profi“ → překrývající se výpisy se nezdvojí
      externalId: nextId(`kb:${e.date}:${key}:${e.amount.toFixed(2)}`),
    };
  });

  const st: ParsedStatement = { iban, accountNumber, currency, openingBalance, closingBalance, periodFrom, periodTo, transactions, bank: "Komerční banka", accountName };
  assertBalance("KB PDF", st);
  const count = valueAfter(lines, "Počet transakcí:");
  assertCounts("KB PDF", st, null, null, count && /^\d+$/.test(count) ? Number(count) : null);
  return st;
}
