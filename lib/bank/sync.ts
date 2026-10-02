import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, sha256Hex } from "@/lib/crypto";
import { fetchNewMail } from "@/lib/mail/imap";
import { parseCamt053, looksLikeCamt } from "./camt";
import { pdfItems, looksLikeKbPdf, parseKbStatementItems } from "./kb-pdf";
import type { ParsedStatement } from "./types";
import { fetchFioPeriod } from "./fio";
import { importStatement, resolveAccountForStatement, sameAccount, findAccountForStatement } from "./import";
import { putFile, extFromName } from "@/lib/storage";
import { matchTaxPayments } from "@/lib/tax/sync";
import { matchUnassignedDocuments } from "@/lib/docs/ingest";
import { notifyOwners, txLine, reportSyncHealth } from "@/lib/telegram/notify";
import { esc } from "@/lib/telegram/api";

export interface SyncReport {
  accountId: string;
  name: string;
  ok: boolean;
  statements: number;
  imported: number;
  matchedDocuments?: number;
  notes: string[];
  error?: string;
}

async function syncImap(account: BankAccount, report: SyncReport) {
  if (!account.imapHost || !account.imapUser || !account.imapPasswordEnc) {
    throw new Error("IMAP není nastaven");
  }
  const res = await fetchNewMail({
    host: account.imapHost,
    port: account.imapPort || 993,
    user: account.imapUser,
    password: decryptSecret(account.imapPasswordEnc),
    folder: account.imapFolder || "INBOX",
    senderFilter: account.senderFilter,
    lastUid: account.lastUid,
  });

  for (const mail of res.mails) {
    for (const att of mail.attachments) {
      const name = att.filename || "statement";
      let statements: ParsedStatement[];
      try {
        const parsed = await parseStatementFile(name, att.contentType || "", att.content);
        if (!parsed) continue;
        statements = parsed;
      } catch (e) {
        report.notes.push(`Výpis ${name}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      let fileUrl: string | undefined;
      for (const [i, st] of statements.entries()) {
        const target = await resolveAccountForStatement(account, st);
        if (!target) {
          report.notes.push(`Výpis ${name}: účet ${st.iban || st.accountNumber} nepatří žádnému nastavenému účtu`);
          continue;
        }
        fileUrl ??= await storeStatementFile(name, att.content);
        const r = await importStatement(target, st, {
          source: "imap",
          externalId: `imap:${account.id}:${mail.uid}:${name}:${i}`,
          fileName: name,
          fileUrl,
        });
        if (!r.skippedDuplicate) {
          report.statements++;
          report.imported += r.imported;
        }
      }
    }
  }
  await prisma.bankAccount.update({ where: { id: account.id }, data: { lastUid: res.maxUid } });
}

async function syncFio(account: BankAccount, report: SyncReport) {
  if (!account.fioTokenEnc) throw new Error("Fio token není nastaven");
  const to = new Date();
  const from = account.lastSyncAt
    ? new Date(account.lastSyncAt.getTime() - 7 * 86400_000)
    : new Date(Date.now() - 60 * 86400_000);
  const st = await fetchFioPeriod(decryptSecret(account.fioTokenEnc), from, to);
  const r = await importStatement(account, st, { source: "fio", externalId: `fio:${to.toISOString()}` });
  report.statements++;
  report.imported += r.imported;
}

export async function syncBankAccount(account: BankAccount): Promise<SyncReport> {
  const report: SyncReport = { accountId: account.id, name: account.name, ok: true, statements: 0, imported: 0, notes: [] };
  try {
    if (account.source === "fio_api") await syncFio(account, report);
    else if (account.source === "imap_camt") await syncImap(account, report);
    else report.notes.push("Ruční import — synchronizace se nespouští");
    if (report.imported > 0) report.matchedDocuments = await afterImport(account.clientId);
    const failCount = await reportSyncHealth({ kind: "bank", refId: account.id, name: account.name, prevFailCount: account.failCount, notes: report.notes });
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date(), lastError: report.notes.length ? report.notes.join("; ").slice(0, 500) : null, failCount },
    });
  } catch (e) {
    report.ok = false;
    report.error = e instanceof Error ? e.message : String(e);
    const failCount = await reportSyncHealth({ kind: "bank", refId: account.id, name: account.name, prevFailCount: account.failCount, error: report.error }).catch(() => account.failCount + 1);
    await prisma.bankAccount.update({ where: { id: account.id }, data: { lastError: report.error.slice(0, 500), failCount } });
  }
  return report;
}

export async function syncAllBankAccounts(): Promise<SyncReport[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true, source: { in: ["imap_camt", "fio_api"] } },
  });
  const out: SyncReport[] = [];
  for (const a of accounts) out.push(await syncBankAccount(a)); // послідовно: ліміти Fio / IMAP
  return out;
}

/** Оригінал виписки в сховище; ключ за хешем — той самий файл зберігається один раз. */
export async function storeStatementFile(name: string, content: Buffer): Promise<string> {
  const ext = extFromName(name) || (content.subarray(0, 5).toString("latin1") === "%PDF-" ? ".pdf" : ".xml");
  const type = ext === ".pdf" ? "application/pdf" : "application/xml";
  return putFile(`statements/${sha256Hex(content).slice(0, 40)}${ext}`, content, type);
}

/**
 * Розпізнає файл виписки: CAMT.053 XML або PDF-виписка KB.
 * null — файл не схожий на виписку (звичайне вкладення); помилка — схожий, але не розібрався.
 */
export async function parseStatementFile(name: string, contentType: string, content: Buffer): Promise<ParsedStatement[] | null> {
  const isPdf = content.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) {
    const items = await pdfItems(content);
    return looksLikeKbPdf(items) ? [parseKbStatementItems(items)] : null;
  }
  const isXml = /xml/i.test(contentType) || /\.xml$/i.test(name) || content.subarray(0, 100).toString("utf8").includes("<?xml");
  if (!isXml) return null;
  const text = content.toString("utf8");
  return looksLikeCamt(text) ? parseCamt053(text) : null;
}

/** Ручне завантаження файлу виписки (CAMT.053 XML або PDF KB). */
export async function importUploadedStatement(account: BankAccount, fileName: string, content: Buffer) {
  const statements = await parseStatementFile(fileName, "", content);
  if (!statements) throw new Error("Soubor není výpis CAMT.053 (XML) ani PDF výpis Komerční banky");
  for (const st of statements) {
    if (!sameAccount(account, st)) {
      throw new Error(`Výpis patří k účtu ${st.accountNumber || st.iban} (${st.currency}), ne k účtu „${account.name}“`);
    }
  }
  const fileUrl = await storeStatementFile(fileName, content);
  let imported = 0;
  let total = 0;
  for (const [i, st] of statements.entries()) {
    const r = await importStatement(account, st, {
      source: "upload",
      externalId: `upload:${sha256Hex(content).slice(0, 24)}:${i}`,
      fileName,
      fileUrl,
    });
    imported += r.imported;
    total += r.total;
  }
  const matchedDocuments = imported > 0 ? await afterImport(account.clientId) : 0;
  return { imported, total, matchedDocuments };
}

export interface FileImportResult {
  fileName: string;
  ok: boolean;
  account?: string;
  imported: number;
  total: number;
  duplicate?: boolean;
  error?: string;
}

/**
 * Ручне завантаження без вибору рахунку: рахунок визначаємо за номером/IBAN у самій виписці.
 * Кожен файл обробляється окремо — помилка одного не зупиняє інші.
 */
export async function importStatementFiles(files: Array<{ name: string; content: Buffer }>): Promise<FileImportResult[]> {
  const out: FileImportResult[] = [];
  const touchedClients = new Set<string>();
  for (const f of files) {
    const res: FileImportResult = { fileName: f.name, ok: false, imported: 0, total: 0 };
    try {
      const statements = await parseStatementFile(f.name, "", f.content);
      if (!statements) throw new Error("Není to výpis CAMT.053 (XML) ani PDF výpis Komerční banky");
      let fileUrl: string | undefined;
      let dup = true;
      for (const [i, st] of statements.entries()) {
        const account = await findAccountForStatement(st);
        if (!account) {
          throw new Error(`Účet ${st.accountNumber || st.iban} (${st.currency}) není v Nastavení → Bankovní účty`);
        }
        fileUrl ??= await storeStatementFile(f.name, f.content);
        const r = await importStatement(account, st, {
          source: "upload",
          externalId: `upload:${sha256Hex(f.content).slice(0, 24)}:${i}`,
          fileName: f.name,
          fileUrl,
        });
        res.account = account.name;
        res.imported += r.imported;
        res.total += r.total;
        dup &&= r.skippedDuplicate;
        touchedClients.add(account.clientId);
      }
      res.duplicate = dup;
      res.ok = true;
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e);
    }
    out.push(res);
  }
  for (const c of touchedClients) await afterImport(c);
  return out;
}

/** Після нових платежів — дочепити документи, що чекали, і сповістити. */
export async function afterImport(clientId: string): Promise<number> {
  // platby daní → termíny v daňovém kalendáři
  await matchTaxPayments(clientId).catch((e) => console.error("matchTaxPayments", e));
  const linked = await matchUnassignedDocuments(clientId);
  if (linked.length) {
    const lines = [`🔗 <b>Автоматично прив'язав ${linked.length} документ(и) до нових платежів</b>`];
    for (const l of linked.slice(0, 10)) {
      const tx = await prisma.transaction.findUnique({ where: { id: l.transactionId }, include: { client: true } });
      const doc = await prisma.document.findUnique({ where: { id: l.documentId } });
      if (tx && doc) lines.push(`• ${esc(doc.originalName)} → ${txLine(tx)}`);
    }
    await notifyOwners("auto_link", null, lines.join("\n"));
  }
  return linked.length;
}
