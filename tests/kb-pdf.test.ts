import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKbStatementItems, czAmount, type PdfItem } from "../lib/bank/kb-pdf";

// Вигадана виписка з тією ж розкладкою, що й справжній «VÝPIS PERIODICKÝ» KB (координати pdfjs).
const w = (s: string) => s.length * 4.5;
const at = (x: number, y: number, str: string, page = 1): PdfItem => ({ page, x, y, w: w(str), str });
/** праворуч вирівняне значення, що закінчується на x = right */
const ra = (right: number, y: number, str: string, page = 1): PdfItem => ({ page, x: right - w(str), y, w: w(str), str });

function header(page = 1): PdfItem[] {
  return [
    at(437, 819, "Datum výpisu:", page), at(528, 819, "31.07.2026", page),
    at(437, 773, "Za období:", page), at(498, 773, "01.07. - 31.07.2026", page),
    at(250, 809, "VÝPIS PERIODICKÝ", page),
    at(194, 790, "k účtu:", page), at(231, 790, "123-4567890123/0100", page),
    at(194, 779, "IBAN:", page), at(231, 779, "CZ6501000001234567890123", page),
    at(194, 759, "měna:", page), at(231, 759, "CZK", page),
    at(43, 733, "www.kb.cz", page), at(43, 722, "BIC / SWIFT kód: KOMBCZPPXXX", page),
    at(48, 557, "Datum", page), at(48, 548, "zúčtování", page), at(48, 538, "Datum", page), at(48, 529, "transakce", page),
    at(101, 557, "Popis transakce", page), at(101, 548, "Identifikace transakce", page),
    at(268, 557, "Název protiúčtu / Číslo a typ karty", page), at(268, 548, "Protiúčet a kód banky / Obchodní místo", page),
    at(451, 557, "VS", page), at(451, 548, "KS", page), at(451, 538, "SS", page),
    at(530, 557, "Připsáno", page), at(524, 548, "Odepsáno", page),
  ];
}

function statement(closing = "1 048,03"): PdfItem[] {
  return [
    ...header(),
    at(48, 575, "POČÁTEČNÍ ZŮSTATEK"), ra(562, 575, "1 000,00"),
    // 1) příchozí tuzemská platba s VS a názvem protiúčtu
    at(48, 515, "05.07.2026"), at(101, 515, "PŘÍCHOZÍ ÚHRADA"), at(268, 515, "Hotel Test s.r.o."), ra(461, 515, "2026017"), ra(562, 515, "250,50"),
    at(48, 505, "04.07.2026"), at(101, 505, "IDENT-0001 22"), at(268, 505, "123456789/0800"), ra(461, 505, "308"),
    at(101, 497, "Zpráva pro příjemce:"),
    at(101, 488, "Faktura 2026017"),
    // 2) odchozí zahraniční platba — jméno v popisu, IBAN a BIC v protiúčtu
    at(48, 470, "10.07.2026"), at(101, 470, "FOP Test Ivan"), at(268, 470, "UA000000000000000000000000001"), ra(562, 470, "-200,00"),
    at(101, 460, "IU000TEST01 11"), at(268, 460, "PBANUA2XXXX"),
    at(101, 451, "Zpráva pro příjemce:"),
    at(101, 442, "Payment for goods, invoice 7"),
    // 3) poplatek
    at(48, 425, "31.07.2026"), at(101, 425, "POPL.ZA VEDENÍ ÚČTU/BALÍČKU"), ra(562, 425, "-2,47"),
    at(101, 417, "060-060-001-000001"),
    at(48, 400, "KONEČNÝ ZŮSTATEK"), ra(562, 400, closing),
    at(48, 372, "Rekapitulace transakcí na účtu"),
    at(48, 353, "Celkový počet transakcí"), at(452, 353, "1"), at(557, 353, "2"),
    at(43, 36, "Komerční banka, a.s."),
  ];
}

test("KB PDF: hlavička, zůstatky, období", () => {
  const st = parseKbStatementItems(statement());
  assert.equal(st.accountNumber, "123-4567890123/0100");
  assert.equal(st.iban, "CZ6501000001234567890123");
  assert.equal(st.currency, "CZK");
  assert.equal(st.openingBalance, 1000);
  assert.equal(st.closingBalance, 1048.03);
  assert.equal(st.periodFrom, "2026-07-01");
  assert.equal(st.periodTo, "2026-07-31");
  assert.equal(st.transactions.length, 3);
});

test("KB PDF: tuzemská příchozí platba — VS/KS, protiúčet, zpráva", () => {
  const t = parseKbStatementItems(statement()).transactions[0];
  assert.equal(t.date, "2026-07-05");
  assert.equal(t.amount, 250.5);
  assert.equal(t.counterpartyName, "Hotel Test s.r.o.");
  assert.equal(t.counterpartyAccount, "123456789/0800");
  assert.equal(t.variableSymbol, "2026017");
  assert.equal(t.constantSymbol, "308");
  assert.equal(t.message, "PŘÍCHOZÍ ÚHRADA | Faktura 2026017");
  assert.match(t.externalId!, /IDENT-0001/);
});

test("KB PDF: zahraniční platba — jméno z popisu, IBAN", () => {
  const t = parseKbStatementItems(statement()).transactions[1];
  assert.equal(t.amount, -200);
  assert.equal(t.counterpartyName, "FOP Test Ivan");
  assert.equal(t.counterpartyAccount, "UA000000000000000000000000001");
  assert.equal(t.message, "FOP Test Ivan | Payment for goods, invoice 7");
});

test("KB PDF: poplatek bez protiúčtu", () => {
  const t = parseKbStatementItems(statement()).transactions[2];
  assert.equal(t.amount, -2.47);
  assert.equal(t.counterpartyName, null);
  assert.equal(t.counterpartyAccount, null);
  assert.equal(t.message, "POPL.ZA VEDENÍ ÚČTU/BALÍČKU");
});

test("KB PDF: nesouhlasící zůstatek → chyba, nic se neimportuje", () => {
  assert.throws(() => parseKbStatementItems(statement("1 050,00")), /kontrola nesouhlasí/);
});

test("KB PDF: jiný PDF než výpis KB → chyba", () => {
  assert.throws(() => parseKbStatementItems([at(10, 10, "Faktura č. 1")]), /není PDF výpis/);
});

test("czAmount: české formáty částek", () => {
  assert.equal(czAmount("-33 517,00"), -33517);
  assert.equal(czAmount("1 025,26"), 1025.26);
});
