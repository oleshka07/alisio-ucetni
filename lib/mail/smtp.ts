import nodemailer from "nodemailer";
import type { DocumentInbox } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

/**
 * Odeslání z už napojené poštovní schránky: SMTP server odvodíme z IMAP (imap.gmail.com → smtp.gmail.com…),
 * přihlášení stejné (u Gmailu heslo aplikace funguje pro IMAP i SMTP).
 */
export function smtpHostFor(imapHost: string): { host: string; port: number; secure: boolean } {
  const h = imapHost.trim().toLowerCase();
  if (h === "outlook.office365.com" || h.endsWith(".office365.com")) return { host: "smtp.office365.com", port: 587, secure: false };
  if (h.startsWith("imap.")) return { host: `smtp.${h.slice(5)}`, port: 465, secure: true };
  return { host: h, port: 465, secure: true };
}

export async function sendFromInbox(
  inbox: Pick<DocumentInbox, "imapHost" | "imapUser" | "imapPasswordEnc">,
  mail: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; content: Buffer }> }
) {
  const { host, port, secure } = smtpHostFor(inbox.imapHost);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: inbox.imapUser, pass: decryptSecret(inbox.imapPasswordEnc) },
    connectionTimeout: 20_000,
  });
  return transport.sendMail({ from: inbox.imapUser, ...mail });
}
