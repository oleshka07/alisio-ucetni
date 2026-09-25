/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ParsedStatement, ParsedTransaction } from "./types";

/**
 * Fio banka API (read-only токен з інтернет-банкінгу).
 * Використовуємо /periods, а не /last: /last зсуває «zarážku», і якщо той самий
 * токен читає ще PMS, сервіси забирали б операції один в одного. Дублікати
 * відсікаються dedupHash при імпорті. Ліміт Fio: 1 запит / 30 с на токен.
 */

const col = (t: any, n: number) => t?.[`column${n}`]?.value ?? null;
const str = (v: any) => (v == null || v === "" ? null : String(v).trim());

export function parseFioJson(json: any): ParsedStatement {
  const st = json?.accountStatement;
  if (!st) throw new Error("Unexpected Fio response");
  const info = st.info || {};
  const txs: any[] = st.transactionList?.transaction || [];

  const transactions: ParsedTransaction[] = txs.map((t) => {
    const account = str(col(t, 2));
    const bank = str(col(t, 3));
    const message = [col(t, 16), col(t, 7), col(t, 25)].map(str).filter(Boolean);
    return {
      date: String(col(t, 0) || "").substring(0, 10),
      amount: Number(col(t, 1)),
      currency: str(col(t, 14)) || info.currency || "CZK",
      counterpartyName: str(col(t, 10)),
      counterpartyAccount: account ? (bank ? `${account}/${bank}` : account) : null,
      variableSymbol: str(col(t, 5)),
      constantSymbol: str(col(t, 4)),
      specificSymbol: str(col(t, 6)),
      message: Array.from(new Set(message)).join(" · "),
      externalId: str(col(t, 22)),
    };
  });

  return {
    iban: info.iban || null,
    accountNumber: info.accountId ? `${info.accountId}/${info.bankId}` : null,
    currency: info.currency || "CZK",
    openingBalance: info.openingBalance ?? null,
    closingBalance: info.closingBalance ?? null,
    periodFrom: info.dateStart ? String(info.dateStart).substring(0, 10) : null,
    periodTo: info.dateEnd ? String(info.dateEnd).substring(0, 10) : null,
    transactions: transactions.filter((t) => t.date && Number.isFinite(t.amount)),
  };
}

export async function fetchFioPeriod(token: string, from: Date, to: Date): Promise<ParsedStatement> {
  const d = (x: Date) => x.toISOString().substring(0, 10);
  const url = `https://fioapi.fio.cz/v1/rest/periods/${encodeURIComponent(token)}/${d(from)}/${d(to)}/transactions.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 409) throw new Error("Fio: занадто часто (ліміт 1 запит / 30 с). Спробуйте за хвилину.");
  if (!res.ok) throw new Error(`Fio API ${res.status}`);
  return parseFioJson(await res.json());
}
