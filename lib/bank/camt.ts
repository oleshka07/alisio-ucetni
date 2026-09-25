/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseStringPromise } from "xml2js";
import type { ParsedStatement, ParsedTransaction } from "./types";

/**
 * Парсер CAMT.053 (ISO 20022 виписка). Основа — ALiSiO PMS bank-inbox-engine,
 * доповнено: рахунок контрагента, VS/KS/SS, кілька Stmt і кілька TxDtls у записі.
 */

const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Знімає префікси простору імен (camt:, ns2: …), щоб шляхи були однаковими. */
function stripPrefix(name: string): string {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

function num(v: any): number {
  if (v == null) return NaN;
  const raw = typeof v === "object" ? v._ ?? v["#text"] : v;
  return parseFloat(String(raw).replace(",", "."));
}

function ccyOf(v: any): string | null {
  return v && typeof v === "object" ? v.Ccy || null : null;
}

function text(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(" ");
  if (typeof v === "object") return String(v._ ?? "");
  return String(v);
}

function accountOf(acct: any): string | null {
  if (!acct) return null;
  const id = acct.Id || {};
  if (id.IBAN) return String(id.IBAN);
  if (id.Othr?.Id) return String(id.Othr.Id);
  return null;
}

/** Виділяє VS/KS/SS з рядка на кшталт "VS:123/KS:0308/SS:" або "/VS123/SS/KS0558". */
export function extractSymbols(...sources: Array<string | null | undefined>) {
  const s = sources.filter(Boolean).join(" ");
  const pick = (key: string) => {
    const m = new RegExp(`(?:^|[^A-Z])${key}[:\\s/]*([0-9]{1,10})`, "i").exec(s);
    return m ? m[1].replace(/^0+(?=\d)/, "") : null;
  };
  return { vs: pick("VS"), ks: pick("KS"), ss: pick("SS") };
}

function parseTx(entry: any, tx: any | null, stmtCcy: string, entryIndex: number, txIndex: number): ParsedTransaction {
  const cdtDbt = entry.CdtDbtInd; // CRDT = прихід, DBIT = видаток
  const isCredit = cdtDbt === "CRDT";
  const amtNode = tx?.Amt ?? tx?.AmtDtls?.TxAmt?.Amt ?? entry.Amt;
  const amount = num(amtNode);
  const currency = ccyOf(amtNode) || ccyOf(entry.Amt) || stmtCcy;
  const date = String(entry.BookgDt?.Dt || entry.BookgDt?.DtTm || entry.ValDt?.Dt || "").substring(0, 10);

  let counterpartyName: string | null = null;
  let counterpartyAccount: string | null = null;
  let message = "";
  let refText = "";
  let externalId: string | null = entry.AcctSvcrRef ? String(entry.AcctSvcrRef) : null;

  if (tx) {
    const rp = tx.RltdPties || {};
    const party = isCredit ? rp.Dbtr : rp.Cdtr;
    counterpartyName = party?.Nm || party?.Pty?.Nm || null;
    counterpartyAccount = accountOf(isCredit ? rp.DbtrAcct : rp.CdtrAcct);
    const agent = isCredit ? tx.RltdAgts?.DbtrAgt : tx.RltdAgts?.CdtrAgt;
    const bankCode = agent?.FinInstnId?.ClrSysMmbId?.MmbId || agent?.FinInstnId?.Othr?.Id;
    if (counterpartyAccount && bankCode && !counterpartyAccount.includes("/") && !/^[A-Z]{2}\d/.test(counterpartyAccount)) {
      counterpartyAccount = `${counterpartyAccount}/${bankCode}`;
    }
    const strd = arr(tx.RmtInf?.Strd)
      .map((s: any) => text(s?.CdtrRefInf?.Ref))
      .filter(Boolean)
      .join(" ");
    message = [text(tx.RmtInf?.Ustrd), text(tx.AddtlTxInf)].filter(Boolean).join(" ").trim();
    const refs = tx.Refs || {};
    refText = [refs.EndToEndId, refs.InstrId, refs.PmtInfId, strd].map(text).filter(Boolean).join(" ");
    externalId = refs.AcctSvcrRef || refs.TxId || externalId;
    if (externalId && txIndex > 0) externalId = `${externalId}#${txIndex}`;
  }
  if (!message) message = text(entry.AddtlNtryInf).trim();

  const sym = extractSymbols(refText, message);
  // Деякі банки кладуть чистий VS у Strd/EndToEndId без префікса
  let vs = sym.vs;
  if (!vs && tx) {
    const e2e = text(tx.Refs?.EndToEndId);
    if (/^\d{1,10}$/.test(e2e)) vs = e2e.replace(/^0+(?=\d)/, "");
  }

  return {
    date,
    amount: isCredit ? amount : -amount,
    currency,
    counterpartyName: counterpartyName ? String(counterpartyName).trim() : null,
    counterpartyAccount,
    variableSymbol: vs,
    constantSymbol: sym.ks,
    specificSymbol: sym.ss,
    message,
    externalId: externalId ? String(externalId) : `e${entryIndex}t${txIndex}`,
  };
}

export async function parseCamt053(xml: string): Promise<ParsedStatement[]> {
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: true,
    tagNameProcessors: [stripPrefix],
    attrNameProcessors: [stripPrefix],
  });
  const doc = parsed.Document;
  if (!doc) throw new Error("Not a CAMT.053 document (missing <Document>)");
  const root = doc.BkToCstmrStmt;
  if (!root) throw new Error("Missing <BkToCstmrStmt> — not a CAMT.053 statement");

  return arr(root.Stmt).map((stmt: any) => {
    const acct = stmt.Acct || {};
    const iban = acct.Id?.IBAN || null;
    const other = acct.Id?.Othr?.Id || null;
    const currency = acct.Ccy || "CZK";

    let openingBalance: number | null = null;
    let closingBalance: number | null = null;
    for (const bal of arr(stmt.Bal)) {
      const code = bal.Tp?.CdOrPrtry?.Cd;
      const v = num(bal.Amt) * (bal.CdtDbtInd === "DBIT" ? -1 : 1);
      if (code === "OPBD" || code === "PRCD") openingBalance = v;
      if (code === "CLBD") closingBalance = v;
    }

    const transactions: ParsedTransaction[] = [];
    arr(stmt.Ntry).forEach((entry: any, ei: number) => {
      if (entry.Sts && text(entry.Sts?.Cd ?? entry.Sts) === "PDNG") return; // не проведені
      const txs = arr(entry.NtryDtls).flatMap((d: any) => arr(d?.TxDtls));
      const withAmounts = txs.filter((t: any) => t?.Amt || t?.AmtDtls?.TxAmt?.Amt);
      if (txs.length > 1 && withAmounts.length === txs.length) {
        txs.forEach((t: any, ti: number) => transactions.push(parseTx(entry, t, currency, ei, ti)));
      } else {
        transactions.push(parseTx(entry, txs[0] ?? null, currency, ei, 0));
      }
    });

    const period = stmt.FrToDt || {};
    return {
      iban,
      accountNumber: other || iban,
      currency,
      openingBalance,
      closingBalance,
      periodFrom: period.FrDtTm ? String(period.FrDtTm).substring(0, 10) : null,
      periodTo: period.ToDtTm ? String(period.ToDtTm).substring(0, 10) : null,
      transactions: transactions.filter((t) => t.date && Number.isFinite(t.amount)),
    };
  });
}

export function looksLikeCamt(content: string): boolean {
  return /BkToCstmrStmt/.test(content.slice(0, 5000));
}
