import type { DocumentInbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { fetchNewMail } from "@/lib/mail/imap";
import { ingestDocument } from "./ingest";
import { ingestReply, notifyOwners } from "@/lib/telegram/notify";
import { isDataBoxNotification } from "@/lib/databox/notification";
import { handleDataBoxMail } from "@/lib/databox/handle";

/** Лист схожий на фактуру/чек (тема або назва файлу). */
export const INVOICE_WORDS = /faktur|invoice|da[ňn]ov[ýy][\s_-]*doklad|[úu][čc]tenk|receipt|rechnung|vy[úu][čc]tov[áa]n|z[áa]lohov|proforma|billing|payment|platb|рахун|інвойс|инвойс|\.isdoc/i;

function looksLikeInvoiceMail(subject: string, text: string, names: string[]): boolean {
  return INVOICE_WORDS.test(subject) || names.some((n) => INVOICE_WORDS.test(n) || /\.isdocx?$/i.test(n)) || INVOICE_WORDS.test(text.slice(0, 600));
}

/**
 * Режими скриньки (DocumentInbox.kind):
 *  documents — усі вкладення (окрема скринька doklady@…)
 *  databox   — лише сповіщення ISDS
 *  mixed     — основна пошта: ISDS + вкладення, схожі на фактуру; AI перевіряє, решта ігнорується
 *
 * Скринька для документів: пересилаєте фактуру на doklady@… — вкладення
 * розпізнаються й чіпляються до платежів. Логіка — з receipt-inbox-engine ALiSiO PMS.
 */

const ALLOWED = [/^application\/pdf$/, /^image\/(jpeg|png|heic|heif|webp)$/, /xml$/, /spreadsheetml|ms-excel/, /^application\/octet-stream$/];

function isUseful(att: { contentType?: string; filename?: string; size?: number; contentDisposition?: string; related?: boolean }): boolean {
  const ct = (att.contentType || "").toLowerCase();
  const name = (att.filename || "").toLowerCase();
  if (att.related) return false; // вбудовані картинки підпису
  if (ct.startsWith("image/") && (att.size || 0) < 25_000) return false; // логотипи
  if (ct === "application/octet-stream" && !/\.(pdf|xml|isdoc|jpg|jpeg|png)$/.test(name)) return false;
  return ALLOWED.some((r) => r.test(ct)) || /\.(pdf|isdoc|xml)$/.test(name);
}

export interface InboxReport {
  inboxId: string;
  name: string;
  ok: boolean;
  documents: number;
  autoLinked: number;
  databox: number;
  error?: string;
}

export async function syncDocumentInbox(inbox: DocumentInbox): Promise<InboxReport> {
  const report: InboxReport = { inboxId: inbox.id, name: inbox.name, ok: true, documents: 0, autoLinked: 0, databox: 0 };
  try {
    const res = await fetchNewMail(
      {
        host: inbox.imapHost,
        port: inbox.imapPort,
        user: inbox.imapUser,
        password: decryptSecret(inbox.imapPasswordEnc),
        folder: inbox.imapFolder,
        // скринька «лише ISDS» — тягнемо тільки листи від ISDS
        senderFilter: inbox.senderFilter || (inbox.kind === "databox" ? "mojedatovaschranka.cz|datovka.gov.cz" : null),
        lastUid: inbox.lastUid,
      },
      {
        maxMessages: 15,
        firstSyncDays: inbox.kind === "databox" ? 14 : 7,
        // відправник ISDS може відрізнятися — ловимо й за темою листа
        subjectMatch:
          inbox.kind === "databox" ? /datov|schr[áa]nk|ISDS/i : inbox.kind === "mixed" ? new RegExp(`datov|schr[áa]nk|ISDS|${INVOICE_WORDS.source}`, "i") : undefined,
        attachmentMatch: inbox.kind === "mixed" ? /\.(pdf|isdoc|isdocx)$/i : undefined,
      }
    );

    for (const mail of res.mails) {
      if (isDataBoxNotification(mail.from, mail.subject, mail.text)) {
        if (await handleDataBoxMail(inbox, mail)) report.databox++;
        continue;
      }
      if (inbox.kind === "databox") continue;
      const mixed = inbox.kind === "mixed";
      let atts = mail.attachments.filter(isUseful);
      if (mixed) {
        // з основної пошти беремо лише PDF/ISDOC і лише з листів, схожих на фактуру
        atts = atts.filter((a) => /pdf|xml|isdoc/i.test(a.contentType || "") || /\.(pdf|isdocx?)$/i.test(a.filename || ""));
        if (!atts.length || !looksLikeInvoiceMail(mail.subject, mail.text, atts.map((a) => a.filename || ""))) continue;
      }
      for (const att of atts) {
        const outcome = await ingestDocument({
          requireFinancial: mixed as true,
          buffer: att.content,
          fileName: att.filename || "priloha",
          mimeType: att.contentType || "application/octet-stream",
          source: "email",
          uploadedBy: "email",
          clientId: inbox.clientId,
          description: mail.subject ? `E-mail: ${mail.subject}`.slice(0, 200) : null,
        });
        if (outcome.skipped) continue;
        const result = outcome;
        if (result.duplicate) continue;
        report.documents++;
        if (result.autoLinked) report.autoLinked++;
        // Telegram: повідомляємо про автоприв'язку і питаємо, коли є кандидати
        if (result.autoLinked || (!result.linkedTo.length && result.candidates.length)) {
          const reply = ingestReply(result);
          await notifyOwners("new_document", result.document.id, `✉️ З пошти (${mail.from}):\n${reply.html}`, reply.kb);
        }
      }
    }
    await prisma.documentInbox.update({
      where: { id: inbox.id },
      data: { lastUid: res.maxUid, lastSyncAt: new Date(), lastError: null },
    });
  } catch (e) {
    report.ok = false;
    report.error = e instanceof Error ? e.message : String(e);
    await prisma.documentInbox.update({ where: { id: inbox.id }, data: { lastError: report.error.slice(0, 500) } });
  }
  return report;
}

export async function syncAllDocumentInboxes() {
  const inboxes = await prisma.documentInbox.findMany({ where: { isActive: true } });
  const out: InboxReport[] = [];
  for (const i of inboxes) out.push(await syncDocumentInbox(i));
  return out;
}
