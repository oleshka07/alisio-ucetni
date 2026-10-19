/**
 * Pokladna firmy pro kontrolu měsíce: kolik hotovosti se vybralo z účtu / vložilo zpět
 * a kolik z ní je doloženo dokladem (ruční platby „Hotově“). Zůstatek se načítá od první platby.
 */
export type CashRow = { bookingDate: Date; amount: number; currency: string; category: string | null; paymentMethod: string | null };

export type CashSummary = {
  currency: string;
  opening: number; // hotovost bez dokladu k začátku měsíce
  withdrawn: number; // výběry z bankomatu
  deposited: number; // vklady zpět na účet
  spent: number; // výdaje hotově s dokladem
  received: number; // příjmy hotově (vydaná faktura zaplacená hotově)
  closing: number; // zbývá doložit ke konci měsíce
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function cashSummary(rows: CashRow[], from: Date, to: Date): CashSummary[] {
  const by = new Map<string, CashSummary>();
  for (const t of rows) {
    if (t.bookingDate >= to) continue;
    const bank = t.category === "cash"; // pohyb na účtu: výběr (−) / vklad (+)
    const manual = t.paymentMethod === "cash"; // ruční platba hotově
    if (!bank && !manual) continue;
    const cur = (t.currency || "CZK").toUpperCase();
    const s = by.get(cur) ?? { currency: cur, opening: 0, withdrawn: 0, deposited: 0, spent: 0, received: 0, closing: 0 };
    // do pokladny: výběr z účtu a příjem hotově; z pokladny: vklad na účet a výdaj hotově
    const delta = bank ? -t.amount : t.amount;
    if (t.bookingDate < from) s.opening += delta;
    else if (bank) t.amount < 0 ? (s.withdrawn -= t.amount) : (s.deposited += t.amount);
    else t.amount < 0 ? (s.spent -= t.amount) : (s.received += t.amount);
    by.set(cur, s);
  }
  return [...by.values()]
    .map((s) => {
      const out = { ...s, opening: r2(s.opening), withdrawn: r2(s.withdrawn), deposited: r2(s.deposited), spent: r2(s.spent), received: r2(s.received) };
      return { ...out, closing: r2(out.opening + out.withdrawn - out.deposited - out.spent + out.received) };
    })
    .filter((s) => s.opening || s.withdrawn || s.deposited || s.spent || s.received);
}
