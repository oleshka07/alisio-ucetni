/**
 * Navazují výpisy účtu? Konečný zůstatek jednoho = počáteční dalšího a mezi obdobími nejsou mezery.
 * Výpisy bez zůstatků (přehled plateb, CSV bez hlavičky) se kontrolují jen na mezery v obdobích.
 */

export interface StatementLike {
  id: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface ContinuityIssue {
  kind: "gap" | "balance";
  afterId: string;
  beforeId: string;
  /** gap: chybí od–do (yyyy-mm-dd); balance: konečný vs počáteční */
  from?: string;
  to?: string;
  closing?: number;
  opening?: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400_000;

export function checkContinuity(statements: StatementLike[]): ContinuityIssue[] {
  const sorted = statements
    .filter((s) => s.periodFrom && s.periodTo)
    .sort((a, b) => a.periodFrom!.getTime() - b.periodFrom!.getTime() || a.periodTo!.getTime() - b.periodTo!.getTime());
  const issues: ContinuityIssue[] = [];
  let covered: StatementLike | null = null; // výpis s dosud nejzazším koncem období
  for (const s of sorted) {
    if (covered) {
      const end = covered.periodTo!.getTime();
      if (s.periodFrom!.getTime() > end + DAY) {
        issues.push({ kind: "gap", afterId: covered.id, beforeId: s.id, from: ymd(new Date(end + DAY)), to: ymd(new Date(s.periodFrom!.getTime() - DAY)) });
      } else if (
        s.periodFrom!.getTime() === end + DAY &&
        covered.closingBalance != null && s.openingBalance != null &&
        Math.abs(covered.closingBalance - s.openingBalance) > 0.005
      ) {
        issues.push({ kind: "balance", afterId: covered.id, beforeId: s.id, closing: covered.closingBalance, opening: s.openingBalance });
      }
    }
    if (!covered || s.periodTo!.getTime() >= covered.periodTo!.getTime()) covered = s;
  }
  return issues;
}

/** Je měsíc (yyyy-mm) celý pokrytý výpisy? Vrací chybějící úseky v rámci měsíce (do dneška). */
export function monthGaps(statements: StatementLike[], month: string, today = new Date()): Array<{ from: string; to: string }> {
  const [y, m] = month.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const endOfMonth = Date.UTC(y, m, 0);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = Math.min(endOfMonth, todayUtc - DAY); // včerejšek — dnešní výpis ještě nemusí být
  if (end < start) return [];
  const ranges = statements
    .filter((s) => s.periodFrom && s.periodTo)
    .map((s) => [s.periodFrom!.getTime(), s.periodTo!.getTime()] as const)
    .filter(([a, b]) => b >= start && a <= end)
    .sort((p, q) => p[0] - q[0]);
  const gaps: Array<{ from: string; to: string }> = [];
  let cursor = start;
  for (const [a, b] of ranges) {
    if (a > cursor) gaps.push({ from: ymd(new Date(cursor)), to: ymd(new Date(Math.min(a - DAY, end))) });
    cursor = Math.max(cursor, b + DAY);
    if (cursor > end) break;
  }
  if (cursor <= end) gaps.push({ from: ymd(new Date(cursor)), to: ymd(new Date(end)) });
  return gaps;
}
