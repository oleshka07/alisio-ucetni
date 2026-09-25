/**
 * Смоук-тест без зовнішніх сервісів: Telegram API підміняється, БД — справжня (локальна).
 * Запуск: npx tsx scripts/smoke.ts  (потрібні POSTGRES_PRISMA_URL, AUTH_SECRET, ENCRYPTION_KEY)
 */
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";

process.env.TELEGRAM_BOT_TOKEN = "TEST:TOKEN";
const sent: Array<{ method: string; body: Record<string, unknown> }> = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://api.telegram.org/file/")) return new Response(Buffer.from("%PDF-1.4 fake receipt " + Date.now()));
  if (url.startsWith("https://api.telegram.org/")) {
    const method = url.split("/").pop()!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ method, body });
    const result = method === "getFile" ? { file_path: "documents/file_1.pdf", file_size: 100 } : method === "getMe" ? { username: "test_bot" } : { message_id: 42 };
    return new Response(JSON.stringify({ ok: true, result }), { headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const { importStatement } = await import("@/lib/bank/import");
  const { afterImport } = await import("@/lib/bank/sync");
  const { handleDataBoxMail } = await import("@/lib/databox/handle");
  const { handleUpdate, linkToken } = await import("@/lib/telegram/bot");
  const { sendDigest, sendUrgentReminders } = await import("@/lib/telegram/notify");

  const client = await prisma.client.findFirstOrThrow({ where: { type: "company" } });
  const account = await prisma.bankAccount.findFirstOrThrow({ where: { clientId: client.id } });
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "owner" } });

  const run = String(Date.now()).slice(-6);
  const vs = `77${run}`;
  // 1) Зворотна прив'язка: фактура прийшла раніше за платіж
  const doc = await prisma.document.create({
    data: {
      clientId: client.id, filename: "x", originalName: "faktura-alza.pdf", fileUrl: "local:none", uploadedBy: "email",
      source: "email", aiStatus: "done", docType: "invoice_in", extractedAmount: 4840, extractedCurrency: "CZK",
      extractedVs: vs, extractedDate: new Date("2026-09-20"), extractedCounterparty: "Alza.cz a.s.",
    },
  });
  const r = await importStatement(
    account,
    {
      iban: null, accountNumber: null, currency: "CZK", openingBalance: null, closingBalance: null, periodFrom: null, periodTo: null,
      transactions: [{ date: "2026-09-24", amount: -4840, currency: "CZK", counterpartyName: "ALZA.CZ", counterpartyAccount: "111/0300", variableSymbol: vs, constantSymbol: null, specificSymbol: null, message: "", externalId: `SMOKE-${run}` }],
    },
    { source: "upload", externalId: `smoke:${Date.now()}` }
  );
  assert.equal(r.imported, 1);
  const matched = await afterImport(client.id);
  assert.equal(matched, 1, "invoice should auto-link to the new payment");
  const tx = await prisma.transaction.findFirstOrThrow({ where: { externalId: `SMOKE-${run}` }, include: { links: true } });
  assert.equal(tx.links[0]?.documentId, doc.id);
  assert.equal(tx.docStatus, "complete");
  console.log("✓ reverse auto-link");

  // 2) Сповіщення датової схранки → задача
  const inbox = await prisma.documentInbox.create({
    data: { name: "Hlavní", kind: "mixed", imapHost: "x", imapUser: "x", imapPasswordEnc: "x", clientId: null },
  });
  const mail = {
    uid: 1, from: "notifikace@mojedatovaschranka.cz", subject: "Nová datová zpráva", date: new Date(), attachments: [],
    text: "Do datové schránky ID schránky: abc1234 (Swipe Scape s.r.o.) byla dodána datová zpráva.\nID datové zprávy: 99887766\nOdesílatel: Finanční úřad pro Karlovarský kraj\nVěc: Výzva k podání přiznání\nDatum a čas dodání: " +
      new Date().toLocaleDateString("cs-CZ").replace(/\s/g, "") + " 09:00",
  };
  mail.text = mail.text.replace("99887766", run + "01");
  assert.equal(await handleDataBoxMail(inbox, mail), true);
  assert.equal(await handleDataBoxMail(inbox, mail), false, "dedup by message id");
  const dbm = await prisma.dataBoxMessage.findUniqueOrThrow({ where: { messageId: run + "01" }, include: { task: true } });
  assert.equal(dbm.clientId, client.id, "mapped by CompanyProfile.dataBox");
  assert.equal(dbm.task?.priority, "high");
  assert.ok(dbm.task?.dueDate);
  console.log("✓ databox → task", dbm.task?.title, "due", dbm.task?.dueDate?.toISOString().slice(0, 10));

  // 3) Telegram: прив'язка, /missing, вибір платежу, файл
  await handleUpdate({ message: { chat: { id: 555, type: "private" }, text: `/start ${linkToken(owner.id)}` } });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).telegramChatId, "555");
  await handleUpdate({ message: { chat: { id: 999, type: "private" }, text: "/missing" } });
  assert.match(String(sent.at(-1)!.body.text), /приватний бот/);
  sent.length = 0;
  await handleUpdate({ message: { chat: { id: 555, type: "private" }, text: "/missing" } });
  assert.match(String(sent[0].body.text), /Платежі без документів|Усі платежі/);

  const open = await prisma.transaction.create({
    data: { clientId: client.id, bookingDate: new Date(), amount: -299, counterpartyName: "Benzina", dedupHash: `smoke-${run}`, requiredDocs: ["receipt"], docStatus: "missing" },
  });
  if (open) {
    await handleUpdate({ callback_query: { id: "cb1", data: `U:${open.id}`, message: { chat: { id: 555 }, message_id: 1 } } });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).tgAwaitingTxId, open.id);
    await handleUpdate({ message: { chat: { id: 555, type: "private" }, document: { file_id: "F1", file_name: "uctenka.pdf", mime_type: "application/pdf" } } });
    const linked = await prisma.transactionDocument.findFirst({ where: { transactionId: open.id } });
    assert.ok(linked, "file from Telegram linked to awaited payment");
    console.log("✓ telegram upload → payment", open.id);
  } else console.log("(no open payments to test Telegram upload)");

  // 4) Дайджест і нагадування
  sent.length = 0;
  const d = await sendDigest(true);
  assert.ok(d.sent >= 1);
  console.log("✓ digest:\n" + String(sent[0].body.text).slice(0, 600));
  const rem = await sendUrgentReminders();
  console.log("✓ reminders", rem);

  // 5) callback «Прочитав» закриває задачу
  await handleUpdate({ callback_query: { id: "cb2", data: `TD:${dbm.taskId}`, message: { chat: { id: 555 }, message_id: 2 } } });
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: dbm.taskId! } })).status, "done");
  console.log("✓ databox task closed from Telegram");
}

main()
  .then(() => console.log("\nSMOKE OK"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
