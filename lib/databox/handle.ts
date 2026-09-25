import type { DocumentInbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FetchedMail } from "@/lib/mail/imap";
import { fmtDate, appUrl } from "@/lib/format";
import { esc } from "@/lib/telegram/api";
import { notifyOwners } from "@/lib/telegram/notify";
import { parseDataBoxNotification } from "./notification";

async function resolveClient(dataBoxId: string | null, fallback: string | null): Promise<string | null> {
  if (dataBoxId) {
    const p = await prisma.companyProfile.findFirst({ where: { dataBox: { equals: dataBoxId, mode: "insensitive" } } });
    if (p) return p.clientId;
    const e = await prisma.employeeProfile.findFirst({ where: { dataBox: { equals: dataBoxId, mode: "insensitive" } } });
    if (e) return e.clientId;
  }
  if (fallback) return fallback;
  const first = await prisma.client.findFirst({ where: { type: "company", isActive: true }, orderBy: { createdAt: "asc" } });
  return first?.id ?? null;
}

export function daysLeft(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400_000);
}

/** Повертає true, якщо створено нову задачу. */
export async function handleDataBoxMail(inbox: DocumentInbox, mail: FetchedMail): Promise<boolean> {
  const n = parseDataBoxNotification(mail.subject, mail.text, mail.date);
  const messageId = n.messageId || `mail:${inbox.id}:${mail.uid}`;
  if (await prisma.dataBoxMessage.findUnique({ where: { messageId } })) return false;

  const clientId = await resolveClient(n.dataBoxId, inbox.clientId);
  const boxLabel = n.dataBoxName || n.dataBoxId || "datová schránka";
  const title = `Datová schránka: ${n.sender || "nová zpráva"}${n.subject ? ` — ${n.subject}` : ""}`.slice(0, 200);
  const description = [
    `Schránka: ${boxLabel}${n.dataBoxId && n.dataBoxName ? ` (${n.dataBoxId})` : ""}`,
    `Odesílatel: ${n.sender || "—"}`,
    `Věc: ${n.subject || "—"}`,
    `ID zprávy: ${n.messageId || "—"}`,
    `Dodáno: ${n.deliveredAt ? fmtDate(n.deliveredAt) : "—"}`,
    `Doručení fikcí: ${n.fictionAt ? fmtDate(n.fictionAt) : "—"}`,
    "",
    "Otevřete schránku, přečtěte zprávu a zkontrolujte lhůtu pro odpověď.",
  ].join("\n");

  let taskId: string | null = null;
  if (clientId) {
    const task = await prisma.task.create({
      data: {
        clientId,
        title,
        description,
        dueDate: n.fictionAt,
        priority: n.important ? "high" : "normal",
        status: "pending",
        createdBy: "system",
        source: "databox",
      },
    });
    taskId = task.id;
  }

  await prisma.dataBoxMessage.create({
    data: {
      messageId,
      dataBoxId: n.dataBoxId,
      dataBoxName: n.dataBoxName,
      clientId,
      sender: n.sender,
      subject: n.subject,
      deliveredAt: n.deliveredAt,
      fictionAt: n.fictionAt,
      emailSubject: mail.subject.slice(0, 300),
      rawText: mail.text.slice(0, 4000),
      taskId,
    },
  });

  const left = daysLeft(n.fictionAt);
  const html = [
    `📬 <b>Нове в датовій схранці</b>${n.important ? " ❗️" : ""}`,
    `Схранка: ${esc(boxLabel)}`,
    `Від: <b>${esc(n.sender || "—")}</b>`,
    n.subject ? `Справа: «${esc(n.subject)}»` : "",
    n.fictionAt ? `Фікція доручення: <b>${fmtDate(n.fictionAt)}</b>${left != null ? ` (через ${left} дн.)` : ""}` : "",
    "",
    "Відкрий схранку і прочитай. Після входу починається строк на відповідь.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  await notifyOwners(
    "databox",
    taskId,
    html,
    taskId
      ? [
          [
            { text: "✅ Прочитав, дій не треба", data: `TD:${taskId}` },
            { text: "📌 Є що робити", data: `TP:${taskId}` },
          ],
          [{ text: "Відкрити задачу", url: appUrl(`/tasks/${taskId}`) }],
        ]
      : undefined
  );
  return true;
}
