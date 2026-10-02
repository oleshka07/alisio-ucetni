import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { manualPaymentBlocker } from "../lib/docs/manual-payment";

const base = { extractedAmount: new Prisma.Decimal(250), extractedDate: new Date("2026-09-01"), clientId: "c1", docType: "invoice_in" };

test("platba mimo banku: kompletní faktura → lze", () => {
  assert.equal(manualPaymentBlocker(base), null);
  assert.equal(manualPaymentBlocker({ ...base, docType: "receipt" }), null);
});

test("platba mimo banku: chybí částka / datum / firma / typ → co doplnit", () => {
  assert.equal(manualPaymentBlocker({ ...base, extractedAmount: null }), "Doplňte: částka");
  assert.equal(
    manualPaymentBlocker({ extractedAmount: null, extractedDate: null, clientId: null, docType: "contract" }),
    "Doplňte: částka, datum, firma, typ (faktura / účtenka)"
  );
});
