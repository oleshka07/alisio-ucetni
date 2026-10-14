import { test } from "node:test";
import assert from "node:assert/strict";
import type { PdfItem } from "../lib/bank/kb-pdf";
import { parseKbClassicItems, looksLikeKbClassicPdf } from "../lib/bank/kb-classic-pdf";
import { parseKbHistoryItems, looksLikeKbHistoryPdf } from "../lib/bank/kb-history-pdf";
import { parseCsItems, looksLikeCsPdf } from "../lib/bank/cs-pdf";
import { parseKbCsv } from "../lib/bank/kb-csv";
import { czPeriod } from "../lib/bank/statement-utils";
import { companyKey, accountScore, filterOverlaps } from "../lib/bank/import";

// Vymyšlené výpisy se stejným rozložením jako skutečné (souřadnice z pdfjs). Žádná skutečná data.
const at = (x: number, y: number, str: string, page = 1): PdfItem => ({ page, x, y, w: str.length * 4.5, str });
const ra = (right: number, y: number, str: string, page = 1): PdfItem => at(right - str.length * 4.5, y, str, page);

function kbClassic(closing = "2 554,00"): PdfItem[] {
  return [
    at(267, 782, "VÝPIS"), at(254, 774, "PERIODICKÝ"),
    at(190, 765, "k účtu:"), at(244, 765, "123-4567890123"),
    at(190, 756, "IBAN:"), at(244, 756, "CZ65 0100 0001 2345 6789 0123"),
    at(57, 752, "Komerční banka, a. s."), at(396, 752, "za období:"), at(486, 752, "července 2026"),
    at(190, 739, "měna:"), at(244, 739, "CZK"),
    at(57, 692, "Počáteční zůstatek:"), at(221, 692, "1 000,00"), at(397, 692, "TEST FIRMA S.R.O."),
    at(57, 683, "Konečný zůstatek:"), at(221, 683, closing),
    at(57, 654, "Počet transakcí:"), at(252, 654, "3"),
    at(58, 620, "Datum splatnosti"), at(173, 620, "Popis platby"), at(377, 620, "VS"), at(506, 620, "Připsáno"),
    at(58, 610, "Datum zúčtování"), at(173, 610, "Název protiúčtu"), at(377, 610, "KS"), at(500, 610, "Odepsáno"),
    at(58, 601, "Datum odepsání v JB"), at(173, 601, "Protiúčet a kód banky"), at(377, 601, "SS"),
    at(173, 591, "Identifikace transakce"),
    // poplatek
    at(58, 579, "31.7.2026"), at(173, 579, "Poplatek"), ra(390, 579, "0"), ra(545, 579, "-99,00"),
    at(58, 570, "31.7.2026"), at(173, 570, "POPL.ZA VEDENÍ ÚČTU/BALÍČKU"), ra(390, 570, "0"),
    at(173, 560, "000-31072026 060-060-000000001"), ra(390, 560, "0"),
    // příchozí s VS/KS
    at(58, 548, "21.7.2026"), at(173, 548, "Příchozí úhrada"), ra(390, 548, "2026017"), ra(545, 548, "654,00"),
    at(58, 538, "21.7.2026"), at(173, 538, "Hotel Test a.s."), ra(390, 538, "308"),
    at(58, 529, "21.7.2026"), at(173, 529, "Hotel Test a.s."), ra(390, 529, "0"),
    at(173, 519, "123456789/0800"),
    at(173, 509, "120-20260721 TESTID0001"),
    // další příchozí
    at(58, 497, "13.7.2026"), at(173, 497, "Příchozí úhrada"), ra(390, 497, "0"), ra(545, 497, "999,00"),
    at(58, 488, "13.7.2026"), at(173, 488, "Faktura 7"), ra(390, 488, "0"),
    at(173, 469, "ODBĚRATEL S.R.O."),
    at(173, 459, "228-13072026 TESTID0002"),
    at(142, 427, "Komerční banka, a.s., se sídlem: Praha 1, Na Příkopě 33"),
  ];
}

test("KB PDF (běžný účet): hlavička, období z názvu měsíce, zůstatky", () => {
  const items = kbClassic();
  assert.ok(looksLikeKbClassicPdf(items));
  const st = parseKbClassicItems(items);
  assert.equal(st.accountNumber, "123-4567890123/0100");
  assert.equal(st.iban, "CZ6501000001234567890123");
  assert.equal(st.periodFrom, "2026-07-01");
  assert.equal(st.periodTo, "2026-07-31");
  assert.equal(st.accountName, "TEST FIRMA S.R.O.");
  assert.equal(st.transactions.length, 3);
  const [fee, inc, inc2] = st.transactions;
  assert.equal(fee.amount, -99);
  assert.equal(fee.counterpartyName, null);
  assert.equal(inc.counterpartyName, "Hotel Test a.s.");
  assert.equal(inc.counterpartyAccount, "123456789/0800");
  assert.equal(inc.variableSymbol, "2026017");
  assert.equal(inc.constantSymbol, "308");
  assert.equal(inc.externalId, "kb:2026-07-21:120-20260721 TESTID0001:654.00");
  assert.equal(inc2.counterpartyName, "ODBĚRATEL S.R.O.");
  assert.equal(inc2.message, "Příchozí úhrada | Faktura 7");
});

test("KB PDF (běžný účet): nesedí zůstatek → chyba", () => {
  assert.throws(() => parseKbClassicItems(kbClassic("2 555,00")), /kontrola nesouhlasí/);
});

const CSV = [
  '"MojeBanka, export transakční historie";',
  '"Číslo účtu";"123-4567890123 CZK";',
  '"IBAN";"CZ6501000001234567890123";',
  '"Název účtu";"TEST FIRMA S.R.O.";',
  '"Výpis za období";"01.07.2026";',
  ';"31.07.2026";',
  '"Počet položek";"3";',
  '"Počáteční zůstatek";"1000,00";',
  '"Konečný zůstatek";"2554,00";',
  "",
  '"Datum splatnosti";"Datum odepsání z jiné banky";"Protiúčet a kód banky";"Název protiúčtu";"Částka";"Originální částka";"Originální měna";"Kurz";"VS";"KS";"SS";"Identifikace transakce";"Systémový popis";"Popis příkazce";"Popis pro příjemce";"AV pole 1";',
  '"31.07.2026";;"";;"-99,00";"";"";"";"0";"0";"0";"000-31072026 060-060-000000001";"Poplatek";"POPL.ZA VEDENÍ ÚČTU/BALÍČKU";;"   ";',
  '"21.07.2026";"21.07.2026";"123456789/0800";"Hotel Test a.s.";"+654,00";"";"";"";"2026017";"308";"0";"120-20260721 TESTID0001";"Příchozí úhrada";"Hotel Test a.s.";;"   ";',
  '"13.07.2026";;"";"ODBĚRATEL S.R.O.";"+999,00";"";"";"";"0";"0";"0";"228-13072026 TESTID0002";"Příchozí úhrada";"Faktura 7";;"   ";',
].join("\r\n");

test("KB CSV z MojeBanky: hlavička, období, stejné ID jako PDF výpis", () => {
  const st = parseKbCsv(CSV);
  assert.equal(st.accountNumber, "123-4567890123/0100");
  assert.equal(st.periodFrom, "2026-07-01");
  assert.equal(st.periodTo, "2026-07-31");
  assert.equal(st.closingBalance, 2554);
  const inc = st.transactions[1];
  assert.equal(inc.counterpartyAccount, "123456789/0800");
  assert.equal(inc.variableSymbol, "2026017");
  assert.equal(st.transactions[0].variableSymbol, null); // „0“ = bez symbolu
  assert.equal(inc.externalId, parseKbClassicItems(kbClassic()).transactions[1].externalId);
});

test("KB CSV: nesedí zůstatek → chyba", () => {
  assert.throws(() => parseKbCsv(CSV.replace("2554,00", "2555,00")), /kontrola nesouhlasí/);
});

test("KB přehled plateb (Historie): částka z kousků, VS/KS/SS, bez zůstatků", () => {
  const items = [
    at(176, 798, "Přehled plateb -"), at(272, 798, "Historie"),
    at(57, 768, "Komerční banka, a. s."), at(490, 757, "Majitel účtu"), at(410, 729, "TEST FIRMA S.R.O."),
    at(443, 684, "123-4567890123/0100"),
    at(64, 633, "Parametry výběru"), at(89, 612, "Od 01.08.2026"), at(89, 601, "Do 31.08.2026"),
    at(64, 538, "Datum"), at(132, 538, "Číslo protiúčtu"), at(220, 538, "Popis platby"), at(375, 538, "VS"), at(390, 538, "KS"), at(405, 538, "SS"), at(505, 538, "Částka"),
    at(64, 516, "31.08.2026"), at(132, 516, "POPL.ZA VEDENÍ ÚČTU/BALÍČKU"), at(252, 516, "Poplatek"), at(375, 516, "0"), at(488, 516, "-99,"), at(503, 516, "00"), at(514, 516, "CZK"),
    at(375, 505, "0"), at(375, 494, "0"),
    at(64, 467, "21.08.2026"), at(132, 467, "123456789/0800"), at(375, 467, "2026017"), at(472, 467, "-44 000,"), at(503, 467, "00"), at(514, 467, "CZK"),
    at(132, 457, "Hotel Test a.s."), at(186, 457, "Odchozí úhrada:"), at(375, 457, "308"),
    at(375, 445, "0"),
    at(372, 365, "Datum a čas tisku: 14.10.2026, 09:50"),
  ];
  assert.ok(looksLikeKbHistoryPdf(items));
  const st = parseKbHistoryItems(items);
  assert.equal(st.accountNumber, "123-4567890123/0100");
  assert.equal(st.periodFrom, "2026-08-01");
  assert.equal(st.openingBalance, null);
  assert.equal(st.accountName, "TEST FIRMA S.R.O.");
  assert.equal(st.transactions.length, 2);
  assert.equal(st.transactions[0].amount, -99);
  const t = st.transactions[1];
  assert.equal(t.amount, -44000);
  assert.equal(t.counterpartyAccount, "123456789/0800");
  assert.equal(t.counterpartyName, "Hotel Test a.s.");
  assert.equal(t.variableSymbol, "2026017");
  assert.equal(t.constantSymbol, "308");
});

function csStatement(closing = "1 899.71"): PdfItem[] {
  const head = (y: number, page: number) => [
    at(48, y, "Zaúčtováno", page), at(97, y, "Položka", page), at(249, y, "Číslo protiúčtu", page), at(403, y, "Variabilní symbol", page), at(522, y, "Částka", page),
    at(48, y - 9, "Provedeno", page), at(97, y - 9, "Částka obratu cizí měny", page), at(249, y - 9, "Název protiúčtu", page), at(403, y - 9, "Konstantní symbol", page),
    at(97, y - 19, "Popis", page), at(249, y - 19, "Kurz měny obratu / Kurz měny účtu", page), at(403, y - 19, "Specifický symbol", page),
  ];
  return [
    at(173, 810, "Výpis z účtu"), at(415, 798, "Období: 01.09.2026 - 30.09.2026"),
    at(173, 786, "Číslo účtu/kód banky: 1234567890/0800"),
    at(43, 748, "Název účtu: Test Kemp s.r.o."), at(43, 739, "Měna účtu: EUR"),
    at(43, 712, "Číslo účtu (IBAN): CZ65 0800 0000 0012 3456 7890"), at(43, 703, "Kód banky (BIC): GIBACZPX"),
    at(43, 573, "Počáteční zůstatek:"), at(210, 573, "1 000.00"),
    at(43, 544, "Konečný zůstatek:"), at(210, 544, closing),
    at(48, 511, "PŘEHLED POHYBŮ NA ÚČTU"), at(249, 511, "Počáteční zůstatek:"), at(504, 511, "1 000.00"),
    ...head(497, 1),
    at(48, 463, "07.09.2026"), at(97, 463, "Příchozí SEPA úhrada"), at(249, 463, "DE89370400440532013000"), at(403, 463, "2609000001"), at(509, 463, "+900.00"),
    at(249, 453, "TEST GUEST GMBH"), at(403, 453, "0558"),
    at(249, 443, "24.190/24.190"),
    at(97, 430, "BIC: TESTDEFFXXX; Dispozice SHA"), at(325, 430, "Booking 15"),
    at(48, 220, "07.09.2026"), at(97, 220, "Ceny za služby"), at(249, 220, "24.200/24.200"),
    at(97, 208, "Cena za příchozí úhradu"), at(249, 208, "8202609000001"), at(528, 208, "-0.29"),
    at(462, 48, "Pokračování na další straně"),
    at(42, 43, "Česká spořitelna, a.s., Praha 4"),
    ...head(749, 2),
    at(48, 714, "30.09.2026", 2), at(97, 714, "Ceny za služby", 2), at(249, 714, "24.440/24.440", 2),
    at(97, 702, "Cena za vedení účtu", 2), at(528, 702, "-0.00", 2),
    at(249, 456, "Konečný zůstatek:", 2), at(504, 456, closing, 2),
    at(48, 380, "Počet položek na výpise", 2), at(420, 380, "2", 2), at(542, 380, "1", 2),
  ];
}

test("Česká spořitelna PDF: SEPA platba, poplatek s částkou na druhém řádku, víc stránek", () => {
  const items = csStatement();
  assert.ok(looksLikeCsPdf([...items, at(43, 300, "PŘEHLED POHYBŮ NA ÚČTU")]));
  const st = parseCsItems(items);
  assert.equal(st.accountNumber, "1234567890/0800");
  assert.equal(st.iban, "CZ6508000000001234567890");
  assert.equal(st.currency, "EUR");
  assert.equal(st.accountName, "Test Kemp s.r.o.");
  assert.equal(st.periodTo, "2026-09-30");
  assert.equal(st.transactions.length, 3);
  const [sepa, fee] = st.transactions;
  assert.equal(sepa.amount, 900);
  assert.equal(sepa.counterpartyName, "TEST GUEST GMBH");
  assert.equal(sepa.counterpartyAccount, "DE89370400440532013000");
  assert.equal(sepa.variableSymbol, "2609000001");
  assert.equal(sepa.constantSymbol, "558");
  assert.equal(fee.amount, -0.29);
  assert.match(fee.message, /Cena za příchozí úhradu/);
});

test("Česká spořitelna PDF: nesedí zůstatek → chyba", () => {
  assert.throws(() => parseCsItems(csStatement("1 900.00")), /kontrola nesouhlasí/);
});

test("období: měsíc slovem i rozsah dat", () => {
  assert.deepEqual(czPeriod("února 2028"), ["2028-02-01", "2028-02-29"]);
  assert.deepEqual(czPeriod("1.10.2026 - 7.10.2026"), ["2026-10-01", "2026-10-07"]);
});

test("přiřazení výpisu firmě a účtu bez čísla", () => {
  assert.equal(companyKey("SWIPE SCAPE S.R.O."), companyKey("Swipe Scape s.r.o."));
  assert.notEqual(companyKey("QA Glamping s.r.o."), companyKey("Swipe Scape s.r.o."));
  const st = { currency: "EUR", bank: "Česká spořitelna" } as Parameters<typeof accountScore>[1];
  const eur = accountScore({ name: "QA EUR Cesca Sporitelna", currency: "EUR" }, st);
  const czk = accountScore({ name: "QA Ceska Sporitelna", currency: "CZK" }, st);
  const kb = accountScore({ name: "KB EUR", currency: "EUR" }, st);
  assert.ok(eur > 0 && eur > czk && eur > kb);
  assert.ok(czk <= 0 && kb <= 0);
});

test("překryv formátů: stejná platba z PDF a z přehledu plateb se nezdvojí", () => {
  const d = (s: string) => new Date(s);
  const existing = [
    { bookingDate: d("2026-07-31"), amount: -99, variableSymbol: null, dedupHash: "a" },
    { bookingDate: d("2026-07-21"), amount: 654, variableSymbol: "2026017", dedupHash: "b" },
  ];
  const rows = [
    { bookingDate: d("2026-07-31"), amount: -99, variableSymbol: null, dedupHash: "x" }, // stejná → pryč
    { bookingDate: d("2026-07-31"), amount: -99, variableSymbol: null, dedupHash: "y" }, // druhý stejný poplatek → nový
    { bookingDate: d("2026-07-21"), amount: 654, variableSymbol: "999", dedupHash: "z" }, // jiný VS → nový
    { bookingDate: d("2026-07-22"), amount: 654, variableSymbol: "2026017", dedupHash: "w" }, // jiný den → nový
  ];
  assert.deepEqual(filterOverlaps(existing, rows).map((r) => r.dedupHash), ["y", "z", "w"]);
});
