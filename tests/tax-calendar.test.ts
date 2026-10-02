import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDeadlines, easterSunday, shiftToWorkday, ymd, taxAccountPrefix, type TaxSettings } from "../lib/tax/calendar";

const sro: TaxSettings = {
  entity: "legal", vatPayer: true, vatPeriod: "monthly", euSupplies: false, hasEmployees: true, hasWithholding: true,
  incomeTaxFiling: "standard", incomeTaxAdvances: "quarter", flatTax: false, roadTaxVehicles: true, ownsRealEstate: true, propertyTaxSplit: false,
};
const Y2026 = [ymd(2026, 1, 1), ymd(2026, 12, 31)] as const;
const due = (list: ReturnType<typeof generateDeadlines>, key: string) => list.find((d) => d.key === key)?.dueDate.toISOString().slice(0, 10);

test("svátky: Velikonoce 2026 a posun na pracovní den", () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(easterSunday(2027).toISOString().slice(0, 10), "2027-03-28");
  assert.equal(shiftToWorkday(ymd(2026, 4, 3)).toISOString().slice(0, 10), "2026-04-07"); // Velký pátek → přes víkend a Velikonoční pondělí
  assert.equal(shiftToWorkday(ymd(2026, 5, 1)).toISOString().slice(0, 10), "2026-05-04");
});

test("DPH a KH měsíčně — termíny 2026 podle kalendáře FS", () => {
  const l = generateDeadlines(sro, ...Y2026);
  assert.equal(due(l, "vat:2025-12"), "2026-01-26");
  assert.equal(due(l, "kh:2025-12"), "2026-01-26");
  assert.equal(due(l, "vat:2026-03"), "2026-04-27");
  assert.equal(due(l, "vat:2026-11"), "2026-12-28");
  assert.equal(l.find((d) => d.key === "vat:2026-01")?.accountPrefix, "705");
});

test("DPH čtvrtletně: KH u PO zůstává měsíční, u OSVČ čtvrtletní", () => {
  const legal = generateDeadlines({ ...sro, vatPeriod: "quarterly" }, ...Y2026);
  assert.equal(due(legal, "vat:2026-Q1"), "2026-04-27");
  assert.equal(due(legal, "vat:2026-01"), undefined);
  assert.equal(due(legal, "kh:2026-01"), "2026-02-25");
  const osvc = generateDeadlines({ ...sro, entity: "osvc", vatPeriod: "quarterly" }, ...Y2026);
  assert.equal(due(osvc, "kh:2026-01"), undefined);
  assert.equal(due(osvc, "kh:2026-Q2"), "2026-07-27");
});

test("daň z příjmů: přiznání standard / elektronicky / poradce a zálohy", () => {
  assert.equal(due(generateDeadlines(sro, ...Y2026), "income_return:2025"), "2026-04-01");
  assert.equal(due(generateDeadlines({ ...sro, incomeTaxFiling: "electronic" }, ...Y2026), "income_return:2025"), "2026-05-04");
  assert.equal(due(generateDeadlines({ ...sro, incomeTaxFiling: "advisor" }, ...Y2026), "income_return:2025"), "2026-07-01");
  const l = generateDeadlines(sro, ...Y2026);
  assert.equal(due(l, "income_advance:2026-03"), "2026-03-16"); // 15.3. je neděle
  assert.equal(l.find((d) => d.key === "income_return:2025")?.accountPrefix, "7704");
  const half = generateDeadlines({ ...sro, incomeTaxAdvances: "half" }, ...Y2026);
  assert.deepEqual(half.filter((d) => d.kind === "income_advance").map((d) => d.period), ["2026-06", "2026-12"]);
  assert.equal(generateDeadlines({ ...sro, incomeTaxAdvances: "none" }, ...Y2026).some((d) => d.kind === "income_advance"), false);
});

test("zaměstnavatel: mzdy do 20., JMHZ od 04/2026, srážková daň do konce měsíce", () => {
  const l = generateDeadlines(sro, ...Y2026);
  assert.equal(due(l, "payroll:2026-05"), "2026-06-22");
  assert.equal(due(l, "payroll:2026-08"), "2026-09-21");
  assert.equal(due(l, "jmhz:2026-03"), undefined);
  assert.equal(due(l, "jmhz:2026-04"), "2026-05-20");
  assert.equal(due(l, "jmhz:2026-Q1"), "2026-06-30");
  assert.equal(due(l, "withholding:2026-01"), "2026-03-02"); // 28.2. sobota
  assert.equal(due(l, "wage_statement:2025"), "2026-03-20");
});

test("silniční daň bez záloh, nemovitosti, Sbírka listin bez posunu", () => {
  const l = generateDeadlines(sro, ...Y2026);
  assert.equal(due(l, "road_tax:2025"), "2026-02-02");
  assert.equal(l.filter((d) => d.kind === "road_tax").length, 1);
  assert.equal(due(l, "property_pay:2026"), "2026-06-01");
  assert.equal(due(l, "property_pay2:2026"), undefined);
  assert.equal(due(l, "statements:2025"), "2026-12-31");
});

test("OSVČ: zálohy na pojistné; paušální daň místo přiznání", () => {
  const osvc = generateDeadlines({ ...sro, entity: "osvc", vatPayer: false, hasEmployees: false }, ...Y2026);
  assert.equal(due(osvc, "osvc_health:2026-04"), "2026-05-11");
  assert.equal(due(osvc, "osvc_social:2026-05"), "2026-06-01"); // 31.5. neděle
  assert.equal(due(osvc, "income_return:2025"), "2026-04-01");
  assert.equal(osvc.find((d) => d.key === "income_return:2025")?.accountPrefix, "721");
  const flat = generateDeadlines({ ...sro, entity: "osvc", vatPayer: false, hasEmployees: false, flatTax: true }, ...Y2026);
  assert.equal(due(flat, "income_return:2025"), undefined);
  assert.equal(due(flat, "flat:2026-03"), "2026-03-20");
  assert.equal(due(flat, "flat_entry:2026"), "2026-01-12");
  assert.equal(flat.some((d) => d.kind === "osvc_social"), false);
});

test("bez DPH a bez zaměstnanců → žádné měsíční povinnosti PO", () => {
  const l = generateDeadlines({ ...sro, vatPayer: false, hasEmployees: false, hasWithholding: false, roadTaxVehicles: false, ownsRealEstate: false, incomeTaxAdvances: "none" }, ...Y2026);
  assert.deepEqual([...new Set(l.map((d) => d.kind))].sort(), ["income_return", "statements"]);
});

test("rozpoznání účtu FÚ", () => {
  assert.equal(taxAccountPrefix("705-77628031/0710"), "705");
  assert.equal(taxAccountPrefix("7704-77628031/0710"), "7704");
  assert.equal(taxAccountPrefix("123456789/0800"), null);
  assert.equal(taxAccountPrefix("999-77628031/0710"), null);
});
