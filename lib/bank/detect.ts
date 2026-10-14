import type { ParsedStatement } from "./types";
import { parseCamt053, looksLikeCamt } from "./camt";
import { pdfItems, looksLikeKbPdf, parseKbStatementItems, type PdfItem } from "./kb-pdf";
import { looksLikeKbClassicPdf, parseKbClassicItems } from "./kb-classic-pdf";
import { looksLikeKbHistoryPdf, parseKbHistoryItems } from "./kb-history-pdf";
import { looksLikeCsPdf, parseCsItems } from "./cs-pdf";
import { decodeCsv, looksLikeKbCsv, parseKbCsv } from "./kb-csv";

/**
 * Rozpoznání formátu výpisu podle obsahu (ne podle názvu souboru).
 * Nový formát = nový parser + řádek v PDF_PARSERS / v parseStatementFile.
 */

const PDF_PARSERS: Array<{ name: string; test: (i: PdfItem[]) => boolean; parse: (i: PdfItem[]) => ParsedStatement }> = [
  { name: "KB výpis (Profi)", test: looksLikeKbPdf, parse: parseKbStatementItems },
  { name: "KB výpis", test: looksLikeKbClassicPdf, parse: parseKbClassicItems },
  { name: "KB přehled plateb", test: looksLikeKbHistoryPdf, parse: parseKbHistoryItems },
  { name: "Česká spořitelna", test: looksLikeCsPdf, parse: parseCsItems },
];

export const SUPPORTED_FORMATS =
  "CAMT.053 (XML), PDF výpis Komerční banky (i přehled plateb), CSV export z MojeBanky, PDF výpis České spořitelny";

const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

function isCsv(name: string, contentType: string, content: Buffer) {
  if (/\.csv$/i.test(name) || /csv/i.test(contentType)) return true;
  const head = content.subarray(0, 400).toString("latin1");
  return !isPdf(content) && !head.includes("<") && (head.match(/;/g) || []).length >= 3;
}

/**
 * null — soubor nevypadá jako výpis (běžná příloha); výjimka — je to výpis, ale nesedí kontrola / nejde načíst.
 */
export async function parseStatementFile(name: string, contentType: string, content: Buffer): Promise<ParsedStatement[] | null> {
  if (isPdf(content)) {
    const items = await pdfItems(content);
    const p = PDF_PARSERS.find((x) => x.test(items));
    return p ? [p.parse(items)] : null;
  }
  if (isCsv(name, contentType, content)) {
    const text = decodeCsv(content);
    return looksLikeKbCsv(text) ? [parseKbCsv(text)] : null;
  }
  const isXml = /xml/i.test(contentType) || /\.xml$/i.test(name) || content.subarray(0, 100).toString("utf8").includes("<?xml");
  if (!isXml) return null;
  const text = content.toString("utf8");
  return looksLikeCamt(text) ? parseCamt053(text) : null;
}

/** Příloha je bankovní výpis? Takové soubory nejsou doklady k platbám. */
export async function isBankStatementFile(content: Buffer, name = ""): Promise<boolean> {
  try {
    if (isPdf(content)) {
      const items = await pdfItems(content);
      return PDF_PARSERS.some((x) => x.test(items));
    }
    if (isCsv(name, "", content)) return looksLikeKbCsv(decodeCsv(content));
    return looksLikeCamt(content.subarray(0, 5000).toString("utf8"));
  } catch {
    return false;
  }
}
