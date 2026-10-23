import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope, parseResponse, recordsFromList, filesFromMessage, ownerFromResponse, IsdsError } from "../lib/databox/isds";
import { needsTask, responseDue } from "../lib/databox/sync";

// syntetické odpovědi ve tvaru WS ISDS v20 (žádná reálná data)
const wrap = (op: string, inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>` +
  `<p:${op}Response xmlns:p="http://isds.czechpoint.cz/v20" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${inner}</p:${op}Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test("obálka požadavku: escapování a prázdné prvky", () => {
  const x = buildEnvelope("MessageDownload", { dmID: "12<3", dbDummy: null });
  assert.match(x, /<MessageDownload xmlns="http:\/\/isds\.czechpoint\.cz\/v20"><dmID>12&lt;3<\/dmID><dbDummy\/><\/MessageDownload>/);
});

test("seznam přijatých zpráv", async () => {
  const xml = wrap(
    "GetListOfReceivedMessages",
    `<p:dmRecords><p:dmRecord dmOrdinal="1"><p:dmID>1000001</p:dmID><p:dbIDSender>abc1234</p:dbIDSender><p:dmSender>Finanční úřad pro Testovací kraj</p:dmSender>` +
      `<p:dmAnnotation>Výzva k podání</p:dmAnnotation><p:dmSenderRefNumber>12345/26</p:dmSenderRefNumber><p:dmPersonalDelivery>false</p:dmPersonalDelivery>` +
      `<p:dmMessageStatus>6</p:dmMessageStatus><p:dmDeliveryTime>2026-10-20T09:15:00.000+02:00</p:dmDeliveryTime><p:dmAcceptanceTime>2026-10-23T10:00:00.000+02:00</p:dmAcceptanceTime></p:dmRecord>` +
      `<p:dmRecord dmOrdinal="2"><p:dmID>1000002</p:dmID><p:dmSender>Obec Test</p:dmSender><p:dmMessageStatus>4</p:dmMessageStatus>` +
      `<p:dmDeliveryTime>2026-10-22T08:00:00.000+02:00</p:dmDeliveryTime><p:dmAcceptanceTime xsi:nil="true"/></p:dmRecord></p:dmRecords>` +
      `<p:dmStatus><p:dmStatusCode>0000</p:dmStatusCode><p:dmStatusMessage>Provedeno úspěšně.</p:dmStatusMessage></p:dmStatus>`
  );
  const recs = recordsFromList(await parseResponse(xml, "GetListOfReceivedMessages"));
  assert.equal(recs.length, 2);
  assert.equal(recs[0].id, "1000001");
  assert.equal(recs[0].sender, "Finanční úřad pro Testovací kraj");
  assert.equal(recs[0].subject, "Výzva k podání");
  assert.equal(recs[0].senderRef, "12345/26");
  assert.equal(recs[0].status, 6);
  assert.equal(recs[0].acceptedAt?.toISOString(), "2026-10-23T08:00:00.000Z");
  assert.equal(recs[1].acceptedAt, null);
  assert.equal(recs[1].personalDelivery, false);
});

test("chybový stav ISDS → výjimka s kódem", async () => {
  const xml = wrap("MessageDownload", `<p:dmStatus><p:dmStatusCode>1222</p:dmStatusCode><p:dmStatusMessage>Nedostatečná oprávnění</p:dmStatusMessage></p:dmStatus>`);
  await assert.rejects(parseResponse(xml, "MessageDownload"), (e: unknown) => e instanceof IsdsError && e.code === "1222");
});

test("stažení zprávy: přílohy z base64", async () => {
  const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
  const xml = wrap(
    "MessageDownload",
    `<p:dmReturnedMessage><p:dmDm><p:dmID>1000001</p:dmID><p:dmFiles>` +
      `<p:dmFile dmMimeType="application/pdf" dmFileMetaType="main" dmFileDescr="vyzva.pdf"><p:dmEncodedContent>${pdf}</p:dmEncodedContent></p:dmFile>` +
      `<p:dmFile dmMimeType="text/plain" dmFileMetaType="enclosure" dmFileDescr="poznamka.txt"><p:dmEncodedContent>${Buffer.from("ahoj").toString("base64")}</p:dmEncodedContent></p:dmFile>` +
      `</p:dmFiles></p:dmDm></p:dmReturnedMessage><p:dmStatus><p:dmStatusCode>0000</p:dmStatusCode></p:dmStatus>`
  );
  const files = filesFromMessage(await parseResponse(xml, "MessageDownload"));
  assert.equal(files.length, 2);
  assert.equal(files[0].name, "vyzva.pdf");
  assert.equal(files[0].mimeType, "application/pdf");
  assert.equal(files[0].content.toString(), "%PDF-1.4 test");
  assert.equal(files[1].content.toString(), "ahoj");
});

test("vlastník schránky", async () => {
  const xml = wrap(
    "GetOwnerInfoFromLogin",
    `<p:dbOwnerInfo><p:dbID>xyz9876</p:dbID><p:dbType>PO</p:dbType><p:firmName>Testovací s.r.o.</p:firmName></p:dbOwnerInfo><p:dbStatus><p:dbStatusCode>0000</p:dbStatusCode></p:dbStatus>`
  );
  assert.deepEqual(ownerFromResponse(await parseResponse(xml, "GetOwnerInfoFromLogin")), { dataBoxId: "xyz9876", name: "Testovací s.r.o." });
});

test("úkol při prvním napojení jen pro nově doručené; termín 15 dní", () => {
  const start = new Date("2026-10-23T10:00:00Z");
  assert.equal(needsTask({ status: 7, acceptedAt: new Date("2026-09-01T10:00:00Z") }, true, start), false);
  assert.equal(needsTask({ status: 6, acceptedAt: new Date("2026-10-23T09:59:30Z") }, true, start), true);
  assert.equal(needsTask({ status: 5, acceptedAt: new Date("2026-10-01T10:00:00Z") }, true, start), true);
  assert.equal(needsTask({ status: 7, acceptedAt: new Date("2026-09-01T10:00:00Z") }, false, start), true);
  assert.equal(responseDue(new Date("2026-10-23T08:00:00Z")).toISOString().slice(0, 10), "2026-11-07");
});
