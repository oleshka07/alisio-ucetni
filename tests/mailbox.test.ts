import { test } from "node:test";
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { configFromInbox, getMessage, listFolders, replyToMessage, saveDraft, searchMessages, sendMessage, MailError } from "@/lib/mail/mailbox";
import { startEnv, USER, PASS } from "./helpers/mailserver";

test("configFromInbox: smtp.* з imap.*, 587 STARTTLS", () => {
  const c = configFromInbox({ imapHost: "imap.seznam.cz", imapPort: 993, imapUser: "a@email.cz", password: "x" });
  assert.equal(c.smtpHost, "smtp.seznam.cz");
  assert.equal(c.smtpPort, 587);
  assert.equal(c.smtpTls, "starttls");
  assert.equal(c.imapTls, "tls");
});

test("пошук, читання, чернетка, відправка, відповідь", async () => {
  const env = await startEnv();
  try {
    const folders = await listFolders(env.cfg);
    assert.ok(folders.some((f) => f.path === "INBOX"));

    const all = await searchMessages(env.cfg, {});
    assert.equal(all.total, 3);
    const subjects = (all.messages as Array<{ subject: string }>).map((m) => m.subject);
    assert.ok(subjects.includes("Faktura 2026-11"));

    // не-ASCII тема знаходиться (локальний фолбек), (локальний фолбек)
    const cz = await searchMessages(env.cfg, { subject: "Žádost" });
    assert.equal(cz.total, 1);

    // вісь «кількість»: два листи з вкладенням/без — фільтр from різнить результат
    const onlyInv = await searchMessages(env.cfg, { from: "billing@hosting.cz" });
    assert.equal(onlyInv.total, 1);
    assert.equal((onlyInv.messages as Array<{ hasAttachments: boolean }>)[0].hasAttachments, true);

    const uid = (onlyInv.messages as Array<{ uid: number }>)[0].uid;
    const msg = await getMessage(env.cfg, "inbox", uid);
    assert.match(msg._notice, /externího e-mailu/);
    assert.equal(msg.attachments[0].filename, "faktura.pdf");

    // чернетка не відправляє
    const d = await saveDraft(env.cfg, { to: ["x@firma.cz"], subject: "Čeština ěšč", text: "Text" });
    assert.equal(d.folder, "Koncepty");
    assert.equal(env.sent.length, 0);

    // відправка
    const s = await sendMessage(env.cfg, { to: ["x@firma.cz"], bcc: ["tajny@firma.cz"], subject: "Test", text: "Ahoj" });
    assert.deepEqual(s.accepted.sort(), ["tajny@firma.cz", "x@firma.cz"]);
    const parsed = await simpleParser(env.sent[0].raw);
    assert.equal(parsed.bcc, undefined); // Bcc лише в конверті
    assert.equal(env.sent[0].from, USER);

    // відповідь зберігає тред і йде на Reply-To
    const all2 = await searchMessages(env.cfg, { from: "hotel.de" });
    const juid = (all2.messages as Array<{ uid: number }>)[0].uid;
    const r = await replyToMessage(env.cfg, { folder: "inbox", uid: juid, text: "Bestätigt." });
    assert.deepEqual(r.to, ["reservierung@hotel.de"]);
    const rp = await simpleParser(env.sent[1].raw);
    assert.equal(rp.inReplyTo, "<orig-2@hotel.de>");
    assert.match(rp.subject || "", /^Re: Reservierung/);
  } finally {
    await env.close();
  }
});

test("хибний пароль → MailError без пароля в тексті", async () => {
  const env = await startEnv();
  try {
    await assert.rejects(
      () => searchMessages({ ...env.cfg, password: "wrong-pass-999" }, {}),
      (e: unknown) => e instanceof MailError && !String((e as Error).message).includes("wrong-pass-999")
    );
    assert.notEqual(PASS, "wrong-pass-999");
  } finally {
    await env.close();
  }
});

test("readOnly блокує чернетку й відправку", async () => {
  const env = await startEnv();
  try {
    const ro = { ...env.cfg, readOnly: true };
    await assert.rejects(() => saveDraft(ro, { to: ["a@b.cz"], subject: "s", text: "t" }), MailError);
    await assert.rejects(() => sendMessage(ro, { to: ["a@b.cz"], subject: "s", text: "t" }), MailError);
    assert.equal(env.sent.length, 0);
  } finally {
    await env.close();
  }
});

test("moveMessages: у кошик, у Archiv (створюється), setFlags", async () => {
  const { moveMessages, setFlags } = await import("@/lib/mail/mailbox");
  const env = await startEnv();
  try {
    const all = await searchMessages(env.cfg, {});
    const uids = (all.messages as Array<{ uid: number }>).map((m) => m.uid);
    assert.equal(all.total, 3);

    const toTrash = await moveMessages(env.cfg, "inbox", [uids[0]], "trash");
    assert.deepEqual(toTrash.uids, [uids[0]]);
    const toArch = await moveMessages(env.cfg, "inbox", [uids[1]], "archive");
    assert.equal(toArch.to, "Archiv");

    // у вхідних лишився один із трьох; у кожній цільовій папці — по одному (вісь: різні призначення)
    assert.equal((await searchMessages(env.cfg, {})).total, 1);
    assert.equal((await searchMessages(env.cfg, { folder: "Archiv" })).total, 1);
    assert.equal((await searchMessages(env.cfg, { folder: "trash" })).total, 1);

    const left = (await searchMessages(env.cfg, {})).messages as Array<{ uid: number; seen: boolean }>;
    await setFlags(env.cfg, "inbox", [left[0].uid], { seen: true });
    assert.equal(((await searchMessages(env.cfg, {})).messages as Array<{ seen: boolean }>)[0].seen, true);
  } finally {
    await env.close();
  }
});
