import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview } from "../lib/finance/overview";

const r = (date: string, amount: number, category: string | null = null, docStatus = "complete", currency = "CZK") => ({
  bookingDate: new Date(`${date}T00:00:00Z`), amount, currency, category, docStatus,
});

test("přehled: příjmy, výdaje, daně, bez převodů a hotovosti, po měnách", () => {
  const [czk, eur] = buildOverview(
    [
      r("2026-01-10", 1000, "customer"),
      r("2026-01-15", -300, "supplier", "missing"),
      r("2026-02-01", -100, "tax", "not_needed"),
      r("2026-02-05", -5000, "cash", "not_needed"), // výběr z bankomatu — nepočítá se
      r("2026-02-06", 2000, "internal", "not_needed"), // převod mezi účty — nepočítá se
      r("2026-03-01", 500, "customer", "missing", "EUR"),
      r("2025-12-31", 999, "customer"), // jiný rok
    ],
    2026,
    new Date("2026-12-31T00:00:00Z")
  );
  assert.equal(czk.currency, "CZK");
  assert.equal(czk.total.income, 1000);
  assert.equal(czk.total.expense, 400);
  assert.equal(czk.total.tax, 100);
  assert.equal(czk.total.expenseUndocumented, 300);
  assert.equal(czk.result, 600);
  assert.equal(czk.months[1].expense, 100);
  assert.equal(eur.total.incomeUndocumented, 500);
});

test("přehled: odhad za rok z uplynulých měsíců od začátku činnosti", () => {
  const [czk] = buildOverview(
    [r("2026-07-10", 1000, "customer"), r("2026-08-10", 3000, "customer"), r("2026-09-10", -1200, "supplier"), r("2026-10-02", 50000, "customer")],
    2026,
    new Date("2026-10-15T00:00:00Z")
  );
  // celé měsíce červenec–září: průměr příjmů 4000/3, výdajů 1200/3; činnost od července → ×6
  assert.equal(czk.projection?.monthsCounted, 3);
  assert.equal(czk.projection?.income, 8000);
  assert.equal(czk.projection?.expense, 2400);
  // minulý rok → bez odhadu
  assert.equal(buildOverview([r("2025-05-01", 10, "customer")], 2025, new Date("2026-10-15T00:00:00Z"))[0].projection, null);
});
