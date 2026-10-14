import type { ParsedStatement, ParsedTransaction } from "./types";
import { toLines, czAmount, type PdfItem } from "./kb-pdf";
import { idCounter, isoFromCz, symbol } from "./statement-utils";

/**
 * Tisk „Přehled plateb – Historie“ z internetového bankovnictví KB.
 * Není to oficiální výpis: nemá zůstatky ani identifikaci transakce, takže kontrolu zůstatku
 * udělat nejde a operace, které už přišly v jiném výpisu, pozná import podle data a částky.
 * Částka je rozdělená na kousky („-44 000,“ + „00“ + „CZK“).
 */

const DATE = /^\d{2}\.\d{2}\.\d{4}$/;
const ACCOUNT = /^(?:\d{1,6}-)?\d{2,10}\/\d{4}$/;

export function looksLikeKbHistoryPdf(items: PdfItem[]): boolean {
  const all = items.map((i) => i.str).join(" ");
  return /Komerční banka|KOMBCZPP/i.test(all) && /Přehled plateb/.test(all) && /Historie/.test(all) && /Parametry výběru/.test(all);
}

interface Entry {
  y: number;
  date: string;
  amount: number;
  currency: string | null;
  lines: Array<{ x: number; str: string }[]>;
  symbols: Array<string | null>;
}

export function parseKbHistoryItems(items: PdfItem[]): ParsedStatement {
  if (!looksLikeKbHistoryPdf(items)) throw new Error("Soubor není přehled plateb KB");
  const lines = toLines(items);
  const all = lines.flatMap((l) => l.items);

  const header = lines.find((l) => l.items.some((i) => i.str === "Částka") && l.items.some((i) => i.str === "Datum"));
  if (!header) throw new Error("KB přehled plateb: nenalezena tabulka");
  const vsX = header.items.find((i) => i.str === "VS")?.x ?? 375;
  const amountX = (header.items.find((i) => i.str === "Částka")?.x ?? 505) - 40;
  const descX = header.items.find((i) => i.str.startsWith("Číslo protiúčtu"))?.x ?? 132;

  const accountNumber = all.find((i) => i.y > header.y && ACCOUNT.test(i.str))?.str ?? null;
  const owner = all.find((i) => i.str === "Majitel účtu");
  const accountName = owner ? all.filter((i) => i.page === owner.page && i.y < owner.y && i.y > owner.y - 45 && i.x > 350 && /[A-Z]{2}/.test(i.str) && !/\d/.test(i.str)).sort((a, b) => b.y - a.y)[0]?.str ?? null : null;
  const valueAfter = (label: string) => {
    const it = all.find((i) => i.str.startsWith(label + " "));
    return it ? it.str.slice(label.length + 1).trim() : null;
  };
  const periodFrom = isoFromCz(valueAfter("Od"));
  const periodTo = isoFromCz(valueAfter("Do"));

  const entries: Entry[] = [];
  for (const l of lines) {
    if (l.page === header.page && l.y >= header.y - 1) continue;
    if (l.y < 60 || /^Datum a čas tisku/.test(l.text)) continue;
    if (lines.some((h) => h.page === l.page && h !== header && h.y <= l.y && h.items.some((i) => i.str === "Částka") && h.items.some((i) => i.str === "Datum"))) continue; // hlavička na další stránce
    const dateItem = l.items.find((i) => i.x < descX && DATE.test(i.str));
    const amountParts = l.items.filter((i) => i.x >= amountX);
    const amountStr = amountParts.filter((i) => !/^[A-Z]{3}$/.test(i.str)).map((i) => i.str).join("").replace(/\s/g, " ");
    if (dateItem && /^[+-]?\d{1,3}(?: \d{3})*,\d{2}$/.test(amountStr)) {
      entries.push({
        y: l.y, date: isoFromCz(dateItem.str)!, amount: czAmount(amountStr),
        currency: amountParts.find((i) => /^[A-Z]{3}$/.test(i.str))?.str ?? null, lines: [], symbols: [null, null, null],
      });
    }
    const cur = entries[entries.length - 1];
    if (!cur) continue;
    const texts: { x: number; str: string }[] = [];
    for (const it of l.items) {
      if (it === dateItem || it.x >= amountX) continue;
      if (Math.abs(it.x - vsX) < 15 && /^\d{1,10}$/.test(it.str)) {
        const k = Math.round((cur.y - l.y) / 11);
        if (k >= 0 && k <= 2) cur.symbols[k] = symbol(it.str);
      } else texts.push({ x: it.x, str: it.str });
    }
    if (texts.length) cur.lines.push(texts);
  }

  const currency = entries.find((e) => e.currency)?.currency ?? "CZK";
  const nextId = idCounter();
  const transactions: ParsedTransaction[] = entries.map((e) => {
    const flat = e.lines.flat().map((t) => t.str).filter((s) => s !== "Skryté číslo účtu");
    const account = flat.find((s) => ACCOUNT.test(s)) ?? null;
    const name = account ? e.lines[1]?.find((t) => t.x < descX + 50 && t.str !== "Skryté číslo účtu")?.str ?? null : null;
    const message = [...new Set(flat.filter((s) => s !== account && s !== name).map((s) => s.replace(/:\s*$/, "").replace(/:\s*(?:\d{1,6}-)?\d{2,10}\/\d{4}$/, "")))].join(" | ");
    return {
      date: e.date,
      amount: e.amount,
      currency: e.currency || currency,
      counterpartyName: name,
      counterpartyAccount: account,
      variableSymbol: e.symbols[0],
      constantSymbol: e.symbols[1],
      specificSymbol: e.symbols[2],
      message,
      externalId: nextId(`kbh:${e.date}:${account || ""}|${e.symbols.join("/")}:${e.amount.toFixed(2)}`),
    };
  });

  return {
    iban: null, accountNumber, currency, openingBalance: null, closingBalance: null,
    periodFrom, periodTo, transactions, bank: "Komerční banka", accountName,
  };
}
