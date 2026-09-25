import { test } from "node:test";
import assert from "node:assert/strict";
import { isDataBoxNotification, parseDataBoxNotification } from "../lib/databox/notification";

const body = `Vážený uživateli,

do datové schránky ID schránky: abc1234 (Swipe Scape s.r.o.) byla dodána nová datová zpráva.

ID datové zprávy: 1234567890
Odesílatel: Finanční úřad pro Karlovarský kraj
Věc: Výzva k odstranění pochybností
Datum a čas dodání: 24.09.2026 10:15:22

Tato zpráva byla vygenerována automaticky.`;

test("detects ISDS notification", () => {
  assert.ok(isDataBoxNotification("notifikace@mojedatovaschranka.cz", "Nová zpráva", ""));
  assert.ok(isDataBoxNotification("someone@x.cz", "Informace", body));
  assert.ok(!isDataBoxNotification("shop@alza.cz", "Vaše objednávka", "Děkujeme za nákup"));
});

test("parses ISDS notification fields and fiction date", () => {
  const n = parseDataBoxNotification("Datová zpráva", body, null);
  assert.equal(n.messageId, "1234567890");
  assert.equal(n.dataBoxId, "abc1234");
  assert.equal(n.dataBoxName, "Swipe Scape s.r.o.");
  assert.equal(n.sender, "Finanční úřad pro Karlovarský kraj");
  assert.equal(n.subject, "Výzva k odstranění pochybností");
  assert.equal(n.deliveredAt?.getDate(), 24);
  assert.equal(n.fictionAt?.toDateString(), new Date(2026, 9, 4).toDateString()); // 24.9 + 10 = 4.10
  assert.equal(n.important, true);
});

test("falls back to e-mail date", () => {
  const d = new Date(2026, 8, 1, 9, 0);
  const n = parseDataBoxNotification("Nová datová zpráva", "Do Vaší datové schránky byla dodána datová zpráva.", d);
  assert.equal(n.messageId, null);
  assert.equal(n.fictionAt?.toDateString(), new Date(2026, 8, 11).toDateString());
  assert.equal(n.important, false);
});
