import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { parseCamt053, extractSymbols } from "../lib/bank/camt";
import { parseFioJson } from "../lib/bank/fio";
import { computeDocStatus, normalizeAccount, pickRule, SYSTEM_RULES } from "../lib/docs/rules";
import type { DocRequirementRule } from "@prisma/client";

const camt = readFileSync(path.join(__dirname, "fixtures/camt053-sample.xml"), "utf8");

test("CAMT.053: statement header, balances, pending skipped", async () => {
  const [st] = await parseCamt053(camt);
  assert.equal(st.iban, "CZ6508000000192000145399");
  assert.equal(st.openingBalance, 100000);
  assert.equal(st.closingBalance, 123345.5);
  assert.equal(st.periodFrom, "2026-09-23");
  assert.equal(st.transactions.length, 4); // PDNG пропущено
});

test("CAMT.053: credit with VS/KS and counterparty account", async () => {
  const [st] = await parseCamt053(camt);
  const t = st.transactions[0];
  assert.equal(t.amount, 30250);
  assert.equal(t.counterpartyName, "Hotel Pupp a.s.");
  assert.equal(t.counterpartyAccount, "123456789/0100");
  assert.equal(t.variableSymbol, "2026017");
  assert.equal(t.constantSymbol, "308");
  assert.equal(t.externalId, "REF-001");
});

test("CAMT.053: debit sign, tax account, fee from AddtlNtryInf", async () => {
  const [st] = await parseCamt053(camt);
  assert.equal(st.transactions[1].amount, -6904.5);
  assert.equal(st.transactions[2].counterpartyAccount, "705-77628341/0710");
  assert.equal(st.transactions[2].variableSymbol, "2724212345");
  assert.equal(st.transactions[3].message, "Poplatek za vedení účtu");
});

test("CAMT with namespace prefixes", async () => {
  const prefixed = camt.replace(/<(\/?)([A-Za-z])/g, "<$1ns2:$2").replace("<ns2:?xml", "<?xml").replace('<ns2:Document xmlns=', '<ns2:Document xmlns:ns2=');
  const [st] = await parseCamt053(prefixed);
  assert.equal(st.transactions.length, 4);
});

test("extractSymbols variants", () => {
  assert.deepEqual(extractSymbols("VS:0012345/KS:0308/SS:"), { vs: "12345", ks: "308", ss: null });
  assert.deepEqual(extractSymbols("/VS123/SS456/KS0558"), { vs: "123", ks: "558", ss: "456" });
});

test("Fio JSON", () => {
  const st = parseFioJson({
    accountStatement: {
      info: { accountId: "2000000000", bankId: "2010", currency: "CZK", iban: "CZ1220100000002000000000", openingBalance: 10, closingBalance: 20, dateStart: "2026-09-01+0200", dateEnd: "2026-09-24+0200" },
      transactionList: {
        transaction: [
          { column22: { value: 26000001 }, column0: { value: "2026-09-02+0200" }, column1: { value: -1210.0 }, column14: { value: "CZK" }, column2: { value: "1234" }, column3: { value: "0300" }, column10: { value: "Alza.cz a.s." }, column5: { value: "555" }, column16: { value: "nákup" } },
        ],
      },
    },
  });
  assert.equal(st.accountNumber, "2000000000/2010");
  assert.equal(st.transactions[0].amount, -1210);
  assert.equal(st.transactions[0].counterpartyAccount, "1234/0300");
  assert.equal(st.transactions[0].variableSymbol, "555");
  assert.equal(st.transactions[0].externalId, "26000001");
  assert.equal(st.transactions[0].date, "2026-09-02");
});

const rules = SYSTEM_RULES.map((r, i) => ({
  id: `r${i}`, clientId: null, isActive: true, direction: "any", counterpartyContains: null, accountContains: null,
  messageContains: null, minAbsAmount: null, maxAbsAmount: null, category: null, requiredDocs: [], notNeeded: false,
  hint: null, isSystem: true, createdAt: new Date(), priority: 100, ...r,
})) as unknown as DocRequirementRule[];

test("rules: tax / fee / meta / default in / default out / internal", async () => {
  const [st] = await parseCamt053(camt);
  const pick = (i: number) => pickRule(rules, { clientId: "c1", ...st.transactions[i] });
  assert.equal(pick(0).category, "customer");
  assert.deepEqual(pick(0).requiredDocs, ["invoice_out"]);
  assert.equal(pick(1).category, "ads_foreign");
  assert.equal(pick(2).category, "tax");
  assert.equal(pick(2).notNeeded, true);
  assert.equal(pick(3).category, "fee");
  const internal = pickRule(rules, { clientId: "c1", amount: -5000, counterpartyAccount: "CZ6508000000192000145399" }, ["19-2000145399/0800"]);
  assert.equal(internal.category, "internal");
});

test("normalizeAccount: CZ IBAN ↔ domestic", () => {
  assert.equal(normalizeAccount("CZ6508000000192000145399"), "19-2000145399/0800");
  assert.equal(normalizeAccount("19-2000145399/0800"), "19-2000145399/0800");
});

test("computeDocStatus", () => {
  assert.equal(computeDocStatus(["invoice_in"], false, []), "missing");
  assert.equal(computeDocStatus(["invoice_in"], false, ["invoice_in"]), "complete");
  assert.equal(computeDocStatus(["invoice_in", "cmr", "customs"], false, ["invoice_in"]), "partial");
  assert.equal(computeDocStatus(["invoice_in"], false, [null]), "complete");
  assert.equal(computeDocStatus([], true, []), "not_needed");
});

import { requirementCoverage } from "../lib/docs/rules";
test("requirementCoverage mirrors computeDocStatus", () => {
  assert.deepEqual(requirementCoverage(["receipt"], [null]), [true]);
  assert.deepEqual(requirementCoverage(["invoice_in", "cmr"], ["cmr"]), [false, true]);
  assert.deepEqual(requirementCoverage(["invoice_in", "cmr"], ["contract"]), [true, false]);
});
