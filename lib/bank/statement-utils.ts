import type { ParsedStatement } from "./types";

/** Společné pomůcky parserů výpisů. */

/** VS/KS/SS: bez úvodních nul; „0“ a prázdné = žádný symbol. */
export function symbol(s: string | null | undefined): string | null {
  const v = (s || "").trim().replace(/^0+(?=\d)/, "");
  return v && v !== "0" ? v : null;
}

/** „131-3405660297“ → „131-3405660297/0100“ (výpis bez kódu banky). */
export function withBankCode(num: string | null | undefined, code: string): string | null {
  const v = (num || "").replace(/\s+/g, "");
  if (!v) return null;
  return v.includes("/") ? v : `${v}/${code}`;
}

export function compactIban(s: string | null | undefined): string | null {
  const v = (s || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v) ? v : null;
}

/** dd.mm.yyyy nebo d.m.yyyy → yyyy-mm-dd */
export function isoFromCz(s: string | null | undefined): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((s || "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

const MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

/** „července 2026“ → [2026-07-01, 2026-07-31]; „1.10.2026 - 7.10.2026“ → obě data. */
export function czPeriod(s: string | null | undefined): [string | null, string | null] {
  const v = (s || "").trim().toLowerCase();
  const range = /(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{4})/.exec(v);
  if (range) return [isoFromCz(range[1]), isoFromCz(range[2])];
  const single = /^(\d{1,2}\.\d{1,2}\.\d{4})$/.exec(v);
  if (single) return [isoFromCz(single[1]), isoFromCz(single[1])];
  const m = /^(\S+)\s+(\d{4})$/.exec(v);
  const mi = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || mi < 0) return [null, null];
  const y = Number(m[2]);
  const last = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  const mm = String(mi + 1).padStart(2, "0");
  return [`${y}-${mm}-01`, `${y}-${mm}-${last}`];
}

/** Stejné operace v jednom výpisu rozliší pořadové číslo: base, base#1, base#2 … */
export function idCounter() {
  const seen = new Map<string, number>();
  return (base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  };
}

/** Počáteční + pohyby = konečný; jinak výpis zahodíme, aby se do evidence nedostal špatně načtený. */
export function assertBalance(label: string, st: ParsedStatement) {
  if (st.openingBalance == null || st.closingBalance == null) return;
  const sum = st.transactions.reduce((s, t) => s + t.amount, 0);
  if (Math.abs(st.openingBalance + sum - st.closingBalance) > 0.005) {
    throw new Error(
      `${label}: kontrola nesouhlasí — počáteční ${st.openingBalance.toFixed(2)} + pohyby ${sum.toFixed(2)} ≠ konečný ${st.closingBalance.toFixed(2)} (načteno ${st.transactions.length} pohybů)`
    );
  }
}

export function assertCounts(label: string, st: ParsedStatement, credits: number | null, debits: number | null, total?: number | null) {
  const c = st.transactions.filter((t) => t.amount > 0).length;
  const d = st.transactions.length - c;
  if (total != null && total !== st.transactions.length) {
    throw new Error(`${label}: počet pohybů nesouhlasí — výpis ${total}, načteno ${st.transactions.length}`);
  }
  if (credits != null && debits != null && (credits !== c || debits !== d)) {
    throw new Error(`${label}: počet pohybů nesouhlasí — výpis ${credits} příjmů / ${debits} výdajů, načteno ${c} / ${d}`);
  }
}
