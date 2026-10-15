import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContinuity, monthGaps } from "../lib/review/continuity";

const s = (id: string, from: string, to: string, opening: number | null, closing: number | null) => ({
  id, periodFrom: new Date(`${from}T00:00:00Z`), periodTo: new Date(`${to}T00:00:00Z`), openingBalance: opening, closingBalance: closing,
});

test("výpisy navazují; mezera; nesedí zůstatek; překryv", () => {
  assert.deepEqual(checkContinuity([s("a", "2026-07-01", "2026-07-31", 0, 100), s("b", "2026-08-01", "2026-08-31", 100, 50)]), []);
  const gap = checkContinuity([s("a", "2026-07-01", "2026-07-31", 0, 100), s("c", "2026-09-01", "2026-09-30", 80, 90)]);
  assert.equal(gap[0].kind, "gap");
  assert.equal(gap[0].from, "2026-08-01");
  assert.equal(gap[0].to, "2026-08-31");
  const bal = checkContinuity([s("a", "2026-07-01", "2026-07-31", 0, 100), s("b", "2026-08-01", "2026-08-31", 90, 50)]);
  assert.equal(bal[0].kind, "balance");
  // přehled plateb přes stejný měsíc (bez zůstatků) nevadí
  assert.deepEqual(checkContinuity([s("a", "2026-07-01", "2026-07-31", 0, 100), s("h", "2026-07-13", "2026-07-31", null, null), s("b", "2026-08-01", "2026-08-31", 100, 50)]), []);
});

test("mezery v měsíci", () => {
  const today = new Date("2026-10-15T10:00:00Z");
  assert.deepEqual(monthGaps([s("a", "2026-09-01", "2026-09-30", 0, 1)], "2026-09", today), []);
  assert.deepEqual(monthGaps([s("a", "2026-09-01", "2026-09-15", 0, 1)], "2026-09", today), [{ from: "2026-09-16", to: "2026-09-30" }]);
  assert.deepEqual(monthGaps([], "2026-10", today), [{ from: "2026-10-01", to: "2026-10-14" }]);
});
