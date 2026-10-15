/**
 * Příjmy a výdaje firmy za rok — z plateb na účtech (a ručních plateb hotově / soukromou kartou).
 * Nezapočítává převody mezi vlastními účty a výběry/vklady hotovosti (to nejsou příjmy ani náklady).
 * Částky po měnách zvlášť — bez přepočtu kurzem.
 */

export const EXCLUDED_CATEGORIES = ["internal", "cash"];

export interface OverviewRow {
  bookingDate: Date;
  amount: number;
  currency: string;
  category: string | null;
  docStatus: string;
}

export interface MonthTotals {
  income: number;
  expense: number; // kladné číslo
  tax: number; // z toho daně a pojistné
  incomeUndocumented: number;
  expenseUndocumented: number;
  undocumentedCount: number;
}

export interface CurrencyOverview {
  currency: string;
  months: MonthTotals[]; // 12
  total: MonthTotals;
  result: number;
  /** odhad za celý rok: průměr uplynulých měsíců × počet měsíců činnosti v roce (jen pro letošek) */
  projection: { income: number; expense: number; result: number; monthsCounted: number } | null;
}

const empty = (): MonthTotals => ({ income: 0, expense: 0, tax: 0, incomeUndocumented: 0, expenseUndocumented: 0, undocumentedCount: 0 });
const round = (n: number) => Math.round(n * 100) / 100;

export function buildOverview(rows: OverviewRow[], year: number, today = new Date()): CurrencyOverview[] {
  const byCur = new Map<string, MonthTotals[]>();
  for (const r of rows) {
    if (r.bookingDate.getUTCFullYear() !== year) continue;
    if (r.category && EXCLUDED_CATEGORIES.includes(r.category)) continue;
    const months = byCur.get(r.currency) ?? Array.from({ length: 12 }, empty);
    byCur.set(r.currency, months);
    const m = months[r.bookingDate.getUTCMonth()];
    const undocumented = r.docStatus === "missing" || r.docStatus === "partial";
    if (r.amount > 0) {
      m.income += r.amount;
      if (undocumented) m.incomeUndocumented += r.amount;
    } else {
      m.expense += -r.amount;
      if (r.category === "tax") m.tax += -r.amount;
      if (undocumented) m.expenseUndocumented += -r.amount;
    }
    if (undocumented) m.undocumentedCount++;
  }

  // probíhající rok: do průměru jen celé uplynulé měsíce
  const isCurrent = today.getUTCFullYear() === year;
  const monthsDone = isCurrent ? today.getUTCMonth() : 12; // celé uplynulé měsíce

  const out: CurrencyOverview[] = [];
  for (const [currency, months] of byCur) {
    for (const m of months) for (const k of Object.keys(m) as (keyof MonthTotals)[]) m[k] = round(m[k]);
    const total = months.reduce((t, m) => {
      for (const k of Object.keys(t) as (keyof MonthTotals)[]) t[k] = round(t[k] + m[k]);
      return t;
    }, empty());
    let projection: CurrencyOverview["projection"] = null;
    if (isCurrent && monthsDone >= 1) {
      // první měsíc s pohybem — firma / účet mohly začít až v průběhu roku
      const first = months.findIndex((m) => m.income || m.expense);
      const counted = first >= 0 ? Math.max(1, monthsDone - first) : 0;
      if (counted >= 2 && first < monthsDone) { // z jediného měsíce odhad nedává smysl
        const done = months.slice(first, monthsDone);
        const inc = done.reduce((s, m) => s + m.income, 0) / counted;
        const exp = done.reduce((s, m) => s + m.expense, 0) / counted;
        // průměr uplynulých měsíců × měsíce od začátku činnosti v roce (rozpracovaný měsíc průměr nezkresluje)
        const income = round(inc * (12 - first));
        const expense = round(exp * (12 - first));
        projection = { income, expense, result: round(income - expense), monthsCounted: counted };
      }
    }
    out.push({ currency, months, total, result: round(total.income - total.expense), projection });
  }
  // CZK první, pak podle obratu
  return out.sort((a, b) => (a.currency === "CZK" ? -1 : b.currency === "CZK" ? 1 : b.total.income + b.total.expense - (a.total.income + a.total.expense)));
}
