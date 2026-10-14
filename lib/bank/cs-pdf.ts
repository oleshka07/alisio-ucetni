import type { ParsedStatement, ParsedTransaction } from "./types";
import { toLines, type Line, type PdfItem } from "./kb-pdf";
import { assertBalance, assertCounts, compactIban, czPeriod, idCounter, isoFromCz, symbol } from "./statement-utils";

/**
 * PDF výpis České spořitelny („Výpis z účtu“, George).
 * Sloupce: Zaúčtováno/Provedeno | Položka/Popis | Číslo a název protiúčtu | VS/KS/SS | Částka.
 * Částky s desetinnou tečkou („-20 002.24“). U poplatků je částka až na druhém řádku operace.
 */

const AMOUNT = /^[+-]?\d{1,3}(?: \d{3})*\.\d{2}$/;
const DATE = /^\d{2}\.\d{2}\.\d{4}$/;
const ACCOUNT = /^(?:(?:\d{1,6}-)?\d{2,10}\/\d{4}|[A-Z]{2}\d{2}[A-Z0-9]{10,30})$/;
const RATE = /^\d+\.\d+\/\d+\.\d+$/;

const csAmount = (s: string) => Number(s.replace(/\s/g, ""));

export function looksLikeCsPdf(items: PdfItem[]): boolean {
  const all = items.map((i) => i.str).join(" ");
  return /Česká spořitelna|GIBACZPX|csas\.cz/i.test(all) && /Výpis z účtu/.test(all) && /PŘEHLED POHYBŮ NA ÚČTU/.test(all);
}

/** „Číslo účtu/kód banky: 6724852329/0800“ — popisek i hodnota jsou v jednom kousku textu */
function labeled(lines: Line[], label: string): string | null {
  for (const l of lines) for (const it of l.items) if (it.str.startsWith(label)) return it.str.slice(label.length).trim() || null;
  return null;
}

function amountRight(lines: Line[], label: string, maxX = 300): number | null {
  const l = lines.find((x) => x.items.some((i) => i.str === label && i.x < 100));
  const it = l?.items.find((i) => i.x < maxX && AMOUNT.test(i.str));
  return it ? csAmount(it.str) : null;
}

interface Entry {
  page: number;
  y: number;
  date: string;
  amount: number | null;
  type: string;
  desc: string[];
  cp: string[];
  extra: string[];
  symbols: Array<string | null>;
}

export function parseCsItems(items: PdfItem[]): ParsedStatement {
  if (!looksLikeCsPdf(items)) throw new Error("Soubor není PDF výpis České spořitelny");
  const lines = toLines(items);

  const accountNumber = labeled(lines, "Číslo účtu/kód banky:");
  const iban = compactIban(labeled(lines, "Číslo účtu (IBAN):"));
  const currency = (labeled(lines, "Měna účtu:") || "CZK").toUpperCase();
  const accountName = labeled(lines, "Název účtu:");
  const [periodFrom, periodTo] = czPeriod(labeled(lines, "Období:"));
  const openingBalance = amountRight(lines, "Počáteční zůstatek:");
  const closingBalance = amountRight(lines, "Konečný zůstatek:");
  if (openingBalance == null || closingBalance == null) throw new Error("ČS PDF: nenalezen počáteční nebo konečný zůstatek");

  const entries: Entry[] = [];
  let done = false;
  for (const p of [...new Set(lines.map((l) => l.page))]) {
    if (done) break;
    const pageLines = lines.filter((l) => l.page === p);
    const head = pageLines.find((l) => l.items.some((i) => i.str === "Zaúčtováno"));
    if (!head) continue;
    const all = pageLines.flatMap((l) => l.items);
    const near = (s: string) => all.find((i) => i.str === s && Math.abs(i.y - head.y) < 30);
    const descX = near("Položka")?.x ?? 97;
    const cpX = near("Číslo protiúčtu")?.x ?? 249;
    const vsX = near("Variabilní symbol")?.x ?? 403;
    const amountX = (near("Částka")?.x ?? 520) - 40;
    const top = Math.min(...all.filter((i) => i.y <= head.y && i.y >= head.y - 30).map((i) => i.y));
    for (const l of pageLines) {
      if (l.y >= top - 1 || l.y < 60) continue;
      if (/^SHRNUTÍ POHYBŮ/.test(l.text) || l.items.some((i) => i.str === "Konečný zůstatek:")) { done = true; break; }
      const dateItem = l.items.find((i) => i.x < descX - 5 && DATE.test(i.str));
      const typeItem = l.items.find((i) => i.x >= descX - 5 && i.x < cpX - 5);
      const starts = !!(dateItem && typeItem);
      if (starts) {
        entries.push({ page: p, y: l.y, date: isoFromCz(dateItem.str)!, amount: null, type: typeItem.str, desc: [], cp: [], extra: [], symbols: [null, null, null] });
      }
      const cur = entries[entries.length - 1];
      if (!cur) continue;
      for (const it of l.items) {
        if (it === dateItem || (starts && it === typeItem)) continue;
        if (it.x >= amountX && AMOUNT.test(it.str)) { cur.amount ??= csAmount(it.str); continue; }
        if (it.x < descX - 5) continue; // datum provedení
        if (it.x >= vsX - 5 && it.x < amountX && /^\d{1,10}$/.test(it.str) && cur.page === l.page) {
          const k = Math.round((cur.y - l.y) / 10.5); // VS / KS / SS pod sebou
          if (k >= 0 && k <= 2) { cur.symbols[k] = symbol(it.str); continue; }
        }
        if (it.x >= cpX - 5 && it.x < cpX + 60) { if (!RATE.test(it.str)) cur.cp.push(it.str); }
        else if (it.x >= cpX + 60) cur.extra.push(it.str);
        else cur.desc.push(it.str);
      }
    }
  }

  const nextId = idCounter();
  const transactions: ParsedTransaction[] = entries.map((e) => {
    if (e.amount == null) throw new Error(`ČS PDF: u operace ${e.date} „${e.type}“ chybí částka`);
    const account = e.cp.find((s) => ACCOUNT.test(s)) ?? null;
    const name = e.cp.find((s) => !ACCOUNT.test(s) && !/^\d+$/.test(s) && !/^\(/.test(s)) ?? null;
    const desc = e.desc.filter((s) => !DATE.test(s) && !/^Kurz ze dne/.test(s));
    const message = [e.type, ...desc, ...e.extra.slice(0, 1)].join(" | ");
    return {
      date: e.date,
      amount: e.amount,
      currency,
      counterpartyName: name,
      counterpartyAccount: account,
      variableSymbol: e.symbols[0],
      constantSymbol: e.symbols[1],
      specificSymbol: e.symbols[2],
      message,
      externalId: nextId(`cs:${e.date}:${account || ""}|${e.symbols.join("/")}|${e.type}:${e.amount.toFixed(2)}`),
    };
  });

  const st: ParsedStatement = { iban, accountNumber, currency, openingBalance, closingBalance, periodFrom, periodTo, transactions, bank: "Česká spořitelna", accountName };
  assertBalance("ČS PDF", st);
  const countLine = lines.find((l) => l.text.startsWith("Počet položek na výpise"));
  const counts = countLine?.items.filter((i) => /^\d+$/.test(i.str)).map((i) => Number(i.str));
  if (counts?.length === 2) assertCounts("ČS PDF", st, counts[1], counts[0]); // odepsáno | připsáno
  return st;
}
