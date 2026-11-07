import type { AccountantReport, DocumentInbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/guard";
import { appUrl, fmtAmount, fmtDate } from "@/lib/format";
import { sendFromInbox } from "@/lib/mail/smtp";
import { esc } from "@/lib/telegram/api";
import { notifyOwners } from "@/lib/telegram/notify";
import { buildMonthZip, signExportLink } from "./month-export";

/** „a@b.cz, c@d.cz“ → ověřený seznam; chyba 400 pro formulář. */
export function parseEmails(v: unknown): string {
  const list = String(v || "").split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
  if (!list.length || list.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new HttpError(400, "Zadejte platný e-mail (více adres oddělte čárkou)");
  return list.join(", ");
}

/** Větší ZIP do přílohy nedáváme (limity pošty ~20–25 MB) — jen odkaz. */
export const MAX_ATTACHMENT = 15 * 1024 * 1024;

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Je čas poslat podklady za minulý měsíc? (od nastaveného dne v měsíci, jednou za měsíc) */
export function isDue(r: Pick<AccountantReport, "isActive" | "dayOfMonth" | "lastSentMonth">, now = new Date()): boolean {
  return r.isActive && now.getDate() >= r.dayOfMonth && r.lastSentMonth !== previousMonth(now);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

type WithInbox = AccountantReport & { senderInbox: DocumentInbox | null };

export async function sendAccountantReport(r: WithInbox, month: string) {
  try {
    const inbox = r.senderInbox ?? (await prisma.documentInbox.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } }));
    if (!inbox) throw new Error("Není napojená žádná poštovní schránka, ze které by šlo odeslat");
    const z = await buildMonthZip(r.clientId, month);
    const { exp, sig } = signExportLink(r.clientId, month);
    const link = appUrl(`/api/export/month/link?${new URLSearchParams({ c: r.clientId, m: month, exp: String(exp), sig }).toString()}`);
    const attach = r.attachZip && z.buf.length <= MAX_ATTACHMENT;
    const sizeMb = (z.buf.length / 1024 / 1024).toFixed(1);

    const lines = [
      "Dobrý den,",
      "",
      `posílám podklady za ${monthLabel(month)} — ${z.clientName}.`,
      r.note ? `\n${r.note}\n` : "",
      `• plateb: ${z.payments} (platby.csv), dokladů k platbám: ${z.documents}`,
      `• bankovních výpisů: ${z.statements}`,
      z.unpaidDocs ? `• doklady bez platby (zaplaceno jinak / zatím nezaplaceno): ${z.unpaidDocs} — složka doklady-bez-platby` : "",
      "",
      attach ? `Vše je v příloze (ZIP, ${sizeMb} MB).` : `Ke stažení (ZIP, ${sizeMb} MB, odkaz platí 30 dní):`,
      attach ? `Odkaz ke stažení (platí 30 dní): ${link}` : link,
    ];
    if (z.missing.length) {
      lines.push("", `Ještě chybí doklad k ${z.missing.length} platbám (dodám):`);
      for (const m of z.missing.slice(0, 25)) lines.push(`  – ${fmtDate(m.date)}  ${fmtAmount(m.amount, m.currency)}  ${m.counterparty || ""}`.trimEnd());
      if (z.missing.length > 25) lines.push(`  … a dalších ${z.missing.length - 25} (viz platby.csv)`);
    }
    lines.push("", "Děkuji");
    const text = lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

    await sendFromInbox(inbox, {
      to: r.email,
      subject: `Podklady za ${monthLabel(month)} — ${z.clientName}`,
      text,
      attachments: attach ? [{ filename: z.fileName, content: Buffer.from(z.buf) }] : undefined,
    });
    await prisma.accountantReport.update({ where: { id: r.id }, data: { lastSentMonth: month, lastSentAt: new Date(), lastError: null } });
    await notifyOwners(
      "accountant_report",
      r.id,
      `📤 <b>Бухгалтерці надіслано документи за ${esc(monthLabel(month))}</b> — ${esc(z.clientName)} → ${esc(r.email)}\nплатежів ${z.payments}, документів ${z.documents}, виписок ${z.statements}${z.missing.length ? `\n⚠️ без документа: ${z.missing.length}` : ""}`
    );
    return { ok: true as const, month, payments: z.payments, documents: z.documents, statements: z.statements, missing: z.missing.length, attached: attach };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await prisma.accountantReport.update({ where: { id: r.id }, data: { lastError: error } });
    await notifyOwners("accountant_report_error", r.id, `⚠️ Не вдалося надіслати документи бухгалтерці (${esc(r.email)}): ${esc(error)}`);
    return { ok: false as const, month, error };
  }
}

/** Cron (denně): komu je čas poslat podklady za minulý měsíc. */
export async function sendDueAccountantReports(now = new Date()) {
  const reports = await prisma.accountantReport.findMany({ where: { isActive: true }, include: { senderInbox: true } });
  const out = [];
  for (const r of reports) if (isDue(r, now)) out.push(await sendAccountantReport(r, previousMonth(now)));
  return out;
}
