import type { ParsedStatement, ParsedTransaction } from "./types";
import { looksLikeCamt } from "./camt";

/**
 * Парсер PDF-виписки Komerční banka («VÝPIS PERIODICKÝ»).
 * KB шле виписки лише в PDF, тож читаємо текст разом із координатами (pdfjs)
 * і розкладаємо по колонках таблиці: дата | опис/ідентифікація | протирахунок | VS/KS/SS | сума.
 * Результат звіряємо з балансами й рекапітуляцією виписки — якщо не сходиться, кидаємо помилку,
 * щоб неправильно розібрана виписка не потрапила в облік.
 */

export interface PdfItem {
  page: number;
  x: number;
  y: number;
  w: number;
  str: string;
}

export async function pdfItems(buf: Buffer | Uint8Array): Promise<PdfItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const out: PdfItem[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        out.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str.trim() });
      }
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

interface Line {
  page: number;
  y: number;
  items: PdfItem[];
  text: string;
}

/** Рядки: сторінки по черзі, зверху вниз; елементи з різницею y < 2 — один рядок. */
export function toLines(items: PdfItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) < 2) last.items.push(it);
    else lines.push({ page: it.page, y: it.y, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str).join(" ");
  }
  return lines;
}

/** Текст PDF по рядках — для AI та пошуку. */
export async function pdfText(buf: Buffer | Uint8Array): Promise<string> {
  return toLines(await pdfItems(buf)).map((l) => l.text).join("\n");
}

export function looksLikeKbPdf(items: PdfItem[]): boolean {
  const all = items.map((i) => i.str).join(" ");
  return /KOMBCZPP|Komer.{0,3}n.{0,3}banka|www\.kb\.cz/i.test(all) && /POČÁTEČNÍ ZŮSTATEK/.test(all);
}

const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT = /^[+-]?\d{1,3}(?:[  ]\d{3})*,\d{2}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const DOMESTIC = /^(?:\d{1,6}-)?\d{2,10}\/\d{4}$/;
const BIC = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const MSG_MARK = /^Zpráva pro (příjemce|plátce)\s*:?\s*(.*)$/i;

export function czAmount(s: string): number {
  return Number(s.replace(/[  ]/g, "").replace(",", "."));
}

function isoDate(s: string): string | null {
  const m = DATE.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Значення праворуч від мітки в тому ж рядку ("k účtu:" → "131-3405710207/0100"). */
function valueAfter(lines: Line[], label: string): string | null {
  for (const l of lines) {
    const i = l.items.findIndex((it) => it.str === label);
    if (i >= 0 && l.items[i + 1]) return l.items[i + 1].str;
  }
  return null;
}

function amountOnLine(l: Line | undefined): number | null {
  const it = l?.items.find((i) => AMOUNT.test(i.str));
  return it ? czAmount(it.str) : null;
}

interface Columns {
  desc: number;
  cp: number;
  vs: number;
  amount: number;
  tableTop: number;
}

/** Межі колонок беремо із заголовка таблиці на сторінці. */
function columnsOf(pageLines: Line[]): Columns | null {
  const head = pageLines.find((l) => l.items.some((i) => i.str === "Popis transakce"));
  if (!head) return null;
  const x = (pred: (s: string) => boolean) => pageLines.flatMap((l) => l.items).find((i) => pred(i.str) && Math.abs(i.y - head.y) < 40);
  const desc = x((s) => s === "Popis transakce");
  const cp = x((s) => s.startsWith("Název protiúčtu"));
  const vs = x((s) => s === "VS");
  const odep = x((s) => s === "Odepsáno" || s === "Připsáno");
  if (!desc || !cp || !vs || !odep) return null;
  const headerBottom = Math.min(
    ...pageLines.flatMap((l) => l.items).filter((i) => i.y <= head.y && i.y >= head.y - 40 && i.x < odep.x + 60).map((i) => i.y)
  );
  return { desc: desc.x, cp: cp.x, vs: vs.x, amount: vs.x + (odep.x - vs.x) / 2, tableTop: headerBottom - 1 };
}

interface Entry {
  y: number;
  page: number;
  date: string;
  txDate: string | null;
  amount: number;
  desc: string[];
  cp: string[];
  symbols: Array<string | null>;
}

export function parseKbStatementItems(items: PdfItem[]): ParsedStatement {
  if (!looksLikeKbPdf(items)) throw new Error("Soubor není PDF výpis Komerční banky");
  const lines = toLines(items);

  const accountNumber = valueAfter(lines, "k účtu:");
  const iban = valueAfter(lines, "IBAN:");
  const currency = (valueAfter(lines, "měna:") || "CZK").toUpperCase();
  const openLine = lines.find((l) => l.text.startsWith("POČÁTEČNÍ ZŮSTATEK"));
  const closeLine = lines.find((l) => l.text.startsWith("KONEČNÝ ZŮSTATEK"));
  const openingBalance = amountOnLine(openLine);
  const closingBalance = amountOnLine(closeLine);
  if (openingBalance == null || closingBalance == null) throw new Error("KB PDF: nenalezen počáteční nebo konečný zůstatek");

  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  const period = /(\d{2})\.(\d{2})\.(\d{4})?\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(valueAfter(lines, "Za období:") || "");
  if (period) {
    const toYear = Number(period[6]);
    const fromYear = period[3] ? Number(period[3]) : Number(period[2]) > Number(period[5]) ? toYear - 1 : toYear;
    periodFrom = `${fromYear}-${period[2]}-${period[1]}`;
    periodTo = `${period[6]}-${period[5]}-${period[4]}`;
  }

  // ── рядки таблиці операцій ──
  const entries: Entry[] = [];
  let done = false;
  const pages = [...new Set(lines.map((l) => l.page))];
  let cols: Columns | null = null;
  for (const p of pages) {
    if (done) break;
    const pageLines = lines.filter((l) => l.page === p);
    const pageCols = columnsOf(pageLines);
    if (pageCols) cols = pageCols;
    if (!cols) continue;
    const top = pageCols ? pageCols.tableTop : Infinity;
    for (const l of pageLines) {
      if (l.y >= top || l.y < 60) continue; // заголовок сторінки / підвал
      if (/^KONEČNÝ ZŮSTATEK|^Rekapitulace/.test(l.text)) {
        done = true;
        break;
      }
      if (/ZŮSTATEK|^PŘEVOD (Z|NA) /.test(l.text) && !l.items.some((i) => i.x >= cols!.desc && i.x < cols!.amount)) continue;

      const dateItem = l.items.find((i) => i.x < cols!.desc && DATE.test(i.str));
      const amountItem = l.items.find((i) => i.x >= cols!.amount && AMOUNT.test(i.str));
      let cur = entries[entries.length - 1];
      if (dateItem && amountItem) {
        cur = { y: l.y, page: l.page, date: isoDate(dateItem.str)!, txDate: null, amount: czAmount(amountItem.str), desc: [], cp: [], symbols: [null, null, null] };
        entries.push(cur);
      } else if (!cur) {
        continue;
      } else if (dateItem && !cur.txDate) {
        cur.txDate = isoDate(dateItem.str);
      }

      const descParts: string[] = [];
      const cpParts: string[] = [];
      for (const it of l.items) {
        if (it === dateItem || it === amountItem) continue;
        if (it.x >= cols.amount) continue;
        const right = it.x + it.w;
        if (it.x >= cols.cp && right > cols.vs + 2 && /^\d{1,10}$/.test(it.str)) {
          // VS/KS/SS стоять стовпчиком: рядок 0 — VS, 1 — KS, 2 — SS
          const k = cur.page === l.page ? Math.round((cur.y - l.y) / 9.3) : -1;
          if (k >= 0 && k <= 2) cur.symbols[k] = it.str.replace(/^0+(?=\d)/, "");
        } else if (it.x >= cols.cp) cpParts.push(it.str);
        else if (it.x >= cols.desc) descParts.push(it.str);
      }
      if (descParts.length) cur.desc.push(descParts.join(" "));
      if (cpParts.length) cur.cp.push(cpParts.join(" "));
    }
  }

  const transactions: ParsedTransaction[] = entries.map((e, idx) => {
    const msgStart = e.desc.findIndex((d) => MSG_MARK.test(d));
    const head = msgStart >= 0 ? e.desc.slice(0, msgStart) : e.desc;
    const msgLines = msgStart >= 0 ? [MSG_MARK.exec(e.desc[msgStart])![2], ...e.desc.slice(msgStart + 1)].filter(Boolean) : [];
    const popis = head[0] || "";
    const ident = head.slice(1).join(" ");

    const cpTokens = e.cp.flatMap((c) => c.split(/\s+/));
    const counterpartyAccount = cpTokens.find((t) => IBAN.test(t) || DOMESTIC.test(t)) || null;
    const cpName = e.cp.find((c) => !IBAN.test(c) && !DOMESTIC.test(c) && !BIC.test(c)) || null;
    // Для SEPA/закордонних платежів KB пише ім'я контрагента в «Popis transakce»
    const counterpartyName = cpName || (counterpartyAccount ? popis || null : null);

    return {
      date: e.date,
      amount: e.amount,
      currency,
      counterpartyName,
      counterpartyAccount,
      variableSymbol: e.symbols[0],
      constantSymbol: e.symbols[1],
      specificSymbol: e.symbols[2],
      message: [popis, msgLines.join(" ")].filter(Boolean).join(" | "),
      externalId: `kb:${e.date}:${ident || idx}:${e.amount.toFixed(2)}`,
    };
  });

  // ── контроль: баланс і кількість операцій ──
  const sum = transactions.reduce((s, t) => s + t.amount, 0);
  if (Math.abs(openingBalance + sum - closingBalance) > 0.005) {
    throw new Error(
      `KB PDF: kontrola nesouhlasí — počáteční ${openingBalance.toFixed(2)} + pohyby ${sum.toFixed(2)} ≠ konečný ${closingBalance.toFixed(2)} (načteno ${transactions.length} pohybů)`
    );
  }
  const countLine = lines.find((l) => l.text.startsWith("Celkový počet transakcí"));
  const counts = countLine?.items.filter((i) => /^\d+$/.test(i.str)).map((i) => Number(i.str));
  if (counts && counts.length === 2) {
    const credits = transactions.filter((t) => t.amount > 0).length;
    const debits = transactions.length - credits;
    if (credits !== counts[0] || debits !== counts[1]) {
      throw new Error(`KB PDF: počet pohybů nesouhlasí — výpis ${counts[0]}/${counts[1]}, načteno ${credits}/${debits}`);
    }
  }

  return { iban, accountNumber, currency, openingBalance, closingBalance, periodFrom, periodTo, transactions };
}

export async function parseKbPdf(buf: Buffer | Uint8Array): Promise<ParsedStatement> {
  return parseKbStatementItems(await pdfItems(buf));
}

/** Вкладення — банківська виписка (PDF KB або CAMT.053)? Такі не є документами до платежів. */
export async function isBankStatementFile(content: Buffer): Promise<boolean> {
  if (content.subarray(0, 5).toString("latin1") === "%PDF-") {
    try {
      return looksLikeKbPdf(await pdfItems(content));
    } catch {
      return false;
    }
  }
  return looksLikeCamt(content.subarray(0, 5000).toString("utf8"));
}
