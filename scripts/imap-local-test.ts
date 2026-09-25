/** Інтеграційний тест IMAP на локальному сервері hoodiecrow (порт 1143): npx hoodiecrow-imap з листами-прикладами. Не для продакшну. */
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

async function main() {
  const { syncBankAccount } = await import("@/lib/bank/sync");
  const { syncDocumentInbox } = await import("@/lib/docs/inbox-sync");
  const client = await prisma.client.findFirstOrThrow({ where: { type: "company" } });
  const acc = await prisma.bankAccount.create({
    data: { clientId: client.id, name: "IMAP test", source: "imap_camt", imapHost: "127.0.0.1", imapPort: 1143, imapUser: "u", imapPasswordEnc: encryptSecret("p"), senderFilter: "kb.cz" },
  });
  const r1 = await syncBankAccount(acc);
  console.log("bank sync 1:", r1);
  assert.ok(r1.ok, r1.error);
  assert.equal(r1.imported, 4);
  const r2 = await syncBankAccount((await prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } })));
  console.log("bank sync 2:", r2);
  assert.equal(r2.imported, 0, "no re-import, lastUid advanced");

  const mixed = await prisma.documentInbox.create({
    data: { name: "main", kind: "mixed", imapHost: "127.0.0.1", imapPort: 1143, imapUser: "u", imapPasswordEnc: encryptSecret("p") },
  });
  const m = await syncDocumentInbox(mixed);
  console.log("mixed inbox:", m);
  assert.ok(m.ok, m.error);
  assert.equal(m.databox, 1);

  const docs = await prisma.documentInbox.create({
    data: { name: "doklady", kind: "documents", imapHost: "127.0.0.1", imapPort: 1143, imapUser: "u", imapPasswordEnc: encryptSecret("p"), senderFilter: "hosting.cz" },
  });
  const d = await syncDocumentInbox(docs);
  console.log("documents inbox:", d);
  assert.equal(d.documents, 1);
  const again = await syncDocumentInbox(await prisma.documentInbox.findUniqueOrThrow({ where: { id: docs.id } }));
  assert.equal(again.documents, 0);
  console.log("IMAP OK");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
