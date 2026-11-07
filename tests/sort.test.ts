import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANY_DOC_TYPES } from "../lib/docs/ingest";
import { COMPANY_DOC_CATEGORIES } from "../lib/docs/company-docs";
import { DOC_TYPES } from "../lib/docs/types";
import { isBankStatementFile } from "../lib/bank/detect";

test("druhy dokumentů firmy míří na existující kategorie", () => {
  for (const [kind, cat] of Object.entries(COMPANY_DOC_TYPES)) assert.ok(cat! in COMPANY_DOC_CATEGORIES, `${kind} → ${cat}`);
  assert.ok("poa" in COMPANY_DOC_CATEGORIES);
  assert.ok("bank_statement" in DOC_TYPES);
});

test("faktura není výpis", async () => {
  assert.equal(await isBankStatementFile(Buffer.from("Faktura č. 2026-1\nCelkem 1 000 Kč"), "faktura.txt"), false);
});
