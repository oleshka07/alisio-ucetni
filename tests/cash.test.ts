import { test } from "node:test";
import assert from "node:assert/strict";
import { cashSummary } from "../lib/review/cash";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (date: string, amount: number, category: string | null, paymentMethod: string | null = null, currency = "CZK") => ({
  bookingDate: d(date), amount, currency, category, paymentMethod,
});

test("pokladna: výběr, vklad, výdaje hotově, načítání z minulých měsíců", () => {
  const rows = [
    row("2026-08-06", -44000, "cash"), // výběr
    row("2026-08-20", -1000, "supplier", "cash"), // účtenka hotově
    row("2026-09-12", 1200, "cash"), // vklad zpět
    row("2026-09-29", -548, "supplier", "cash"),
    row("2026-09-15", -15.7, "supplier", "private_card", "EUR"), // soukromá karta se nepočítá
    row("2026-09-10", -300, "fees"), // jiné bankovní platby se nepočítají
    row("2026-10-02", -100, "supplier", "cash"), // po konci měsíce
  ];
  assert.deepEqual(cashSummary(rows, d("2026-08-01"), d("2026-09-01")), [
    { currency: "CZK", opening: 0, withdrawn: 44000, deposited: 0, spent: 1000, received: 0, closing: 43000 },
  ]);
  assert.deepEqual(cashSummary(rows, d("2026-09-01"), d("2026-10-01")), [
    { currency: "CZK", opening: 43000, withdrawn: 0, deposited: 1200, spent: 548, received: 0, closing: 41252 },
  ]);
  assert.deepEqual(cashSummary(rows, d("2026-07-01"), d("2026-08-01")), []);
});
