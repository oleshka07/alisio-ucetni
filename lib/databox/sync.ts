import type { DataBoxAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, sha256Hex } from "@/lib/crypto";
import { putFile, extFromName } from "@/lib/storage";
import { fmtDate, appUrl } from "@/lib/format";
import { esc } from "@/lib/telegram/api";
import { notifyOwners, reportSyncHealth } from "@/lib/telegram/notify";
import { IsdsError, downloadMessage, getOwnerInfo, getPasswordExpiry, listReceived, type EnvelopeRecord, type IsdsLogin } from "./isds";

const DAY = 86400_000;
/** Kolik zpráv stáhnout za jeden běh (zbytek příště) — ať se vejdeme do limitu cron požadavku. */
const MAX_DOWNLOADS = 15;
/** Výchozí lhůta k reakci od doručení, dokud ji člověk neupraví podle dokumentu. */
export const DEFAULT_RESPONSE_DAYS = 15;

/** Pole schránky bezpečná pro UI (bez hesla). */
export const DATABOX_FIELDS = {
  id: true, name: true, clientId: true, environment: true, username: true, dataBoxId: true, ownerName: true,
  passwordExpiresAt: true, isActive: true, lastSyncAt: true, lastError: true, createdAt: true,
} as const;

export function loginOf(acc: Pick<DataBoxAccount, "environment" | "username" | "passwordEnc">): IsdsLogin {
  return { environment: acc.environment, username: acc.username, password: decryptSecret(acc.passwordEnc) };
}

/**
 * Nová zpráva → úkol a upozornění. Při prvním napojení schránky se starší, už dříve doručené zprávy
 * jen uloží do archivu (bez úkolů), aby nezaplavily seznam; úkol dostanou ty, které doručilo až naše přihlášení.
 */
export function needsTask(rec: Pick<EnvelopeRecord, "acceptedAt" | "status">, firstSync: boolean, syncStart: Date): boolean {
  if (!firstSync) return true;
  if (rec.status != null && rec.status <= 5) return true; // dodána / doručena fikcí, nikdo ji nečetl
  return !rec.acceptedAt || rec.acceptedAt.getTime() >= syncStart.getTime() - 10 * 60_000;
}

export function responseDue(acceptedAt: Date | null, now = new Date()): Date {
  const base = acceptedAt ?? now;
  const due = new Date(base.getTime() + DEFAULT_RESPONSE_DAYS * DAY);
  due.setHours(12, 0, 0, 0);
  return due;
}

export type DataBoxSyncResult = { ok: boolean; messages: number; tasks: number; pending: number; error?: string };

export async function syncDataBoxAccount(acc: DataBoxAccount): Promise<DataBoxSyncResult> {
  const syncStart = new Date();
  const firstSync = !acc.lastSyncAt;
  let messages = 0;
  let tasks = 0;
  let pending = 0;
  try {
    const login = loginOf(acc);
    if (!acc.dataBoxId) {
      const owner = await getOwnerInfo(login);
      await prisma.dataBoxAccount.update({ where: { id: acc.id }, data: { dataBoxId: owner.dataBoxId, ownerName: owner.name } });
      acc = { ...acc, dataBoxId: owner.dataBoxId, ownerName: owner.name };
    }
    if (!acc.passwordCheckedAt || syncStart.getTime() - acc.passwordCheckedAt.getTime() > DAY) {
      const exp = await getPasswordExpiry(login).catch(() => undefined);
      if (exp !== undefined) await prisma.dataBoxAccount.update({ where: { id: acc.id }, data: { passwordExpiresAt: exp, passwordCheckedAt: syncStart } });
    }

    const from = new Date((acc.lastSyncAt?.getTime() ?? syncStart.getTime() - 90 * DAY) - 3 * DAY);
    const records = await listReceived(login, from, syncStart);
    const known = await prisma.dataBoxMessage.findMany({ where: { messageId: { in: records.map((r) => r.id) } } });
    const byId = new Map(known.map((k) => [k.messageId, k]));
    const todo = records.filter((r) => !byId.get(r.id)?.downloadedAt && r.status !== 9 && r.status !== 10);
    pending = Math.max(0, todo.length - MAX_DOWNLOADS);

    for (const rec of todo.slice(0, MAX_DOWNLOADS)) {
      const created = await storeMessage(acc, login, rec, byId.get(rec.id) ?? null, needsTask(rec, firstSync, syncStart));
      messages++;
      if (created) tasks++;
    }

    const failCount = await reportSyncHealth({ kind: "databox", refId: acc.id, name: acc.name, prevFailCount: acc.failCount });
    await prisma.dataBoxAccount.update({ where: { id: acc.id }, data: { lastSyncAt: syncStart, lastError: null, failCount } });
    return { ok: true, messages, tasks, pending };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    const failCount = await reportSyncHealth({ kind: "databox", refId: acc.id, name: acc.name, prevFailCount: acc.failCount, error });
    await prisma.dataBoxAccount.update({ where: { id: acc.id }, data: { lastError: error, failCount } });
    return { ok: false, messages, tasks, pending, error };
  }
}

/** Uloží zprávu s přílohami; vrací true, pokud vznikl nový úkol. */
async function storeMessage(
  acc: DataBoxAccount,
  login: IsdsLogin,
  rec: EnvelopeRecord,
  existing: { id: string; taskId: string | null } | null,
  wantTask: boolean
): Promise<boolean> {
  let files: Awaited<ReturnType<typeof downloadMessage>> = [];
  let downloadError: string | null = null;
  let retryLater = false; // výpadek spojení — zkusit příště; odmítnutí ISDS (např. chybí oprávnění) — neopakovat
  try {
    files = await downloadMessage(login, rec.id);
  } catch (e) {
    downloadError = e instanceof Error ? e.message : String(e);
    retryLater = !(e instanceof IsdsError && e.code);
  }

  const docIds: string[] = [];
  const month = new Date().toISOString().slice(0, 7);
  for (const f of files) {
    const fileUrl = await putFile(`databox/${acc.clientId}/${month}/${rec.id}-${crypto.randomUUID()}${extFromName(f.name)}`, f.content, f.mimeType);
    const doc = await prisma.document.create({
      data: {
        clientId: acc.clientId,
        filename: f.name,
        originalName: f.name,
        fileSize: f.content.length,
        mimeType: f.mimeType,
        fileUrl,
        uploadedBy: "databox",
        source: "databox",
        sha256: sha256Hex(f.content),
        aiStatus: "skipped",
        docType: "other",
        companyDoc: true,
        docCategory: "other",
        description: `Datová schránka ${acc.name}: ${rec.sender || "—"}${rec.subject ? ` — ${rec.subject}` : ""} (zpráva ${rec.id})`.slice(0, 500),
      },
    });
    docIds.push(doc.id);
  }

  const boxLabel = `${acc.name}${acc.dataBoxId ? ` (${acc.dataBoxId})` : ""}`;
  const description = [
    `Schránka: ${boxLabel}`,
    `Odesílatel: ${rec.sender || "—"}${rec.senderBoxId ? ` (${rec.senderBoxId})` : ""}`,
    `Věc: ${rec.subject || "—"}`,
    rec.senderRef ? `Č. j. odesílatele: ${rec.senderRef}` : null,
    `ID zprávy: ${rec.id}`,
    `Dodáno: ${rec.deliveredAt ? fmtDate(rec.deliveredAt) : "—"} · doručeno: ${rec.acceptedAt ? fmtDate(rec.acceptedAt) : "—"}`,
    "",
    files.length ? `Přílohy (${files.length}):` : null,
    ...files.map((f, i) => `• ${f.name}: ${appUrl(`/api/documents/${docIds[i]}/file?view=1`)}`),
    downloadError ? `Přílohy se nepodařilo stáhnout (${downloadError.slice(0, 200)}) — otevřete zprávu ve schránce.` : null,
    "",
    `Zpráva je doručená — lhůty už běží. Termín úkolu je orientační (${DEFAULT_RESPONSE_DAYS} dní od doručení); upravte ho podle dokumentu.`,
  ]
    .filter((x) => x !== null)
    .join("\n");

  let taskId = existing?.taskId ?? null;
  let createdTask = false;
  if (taskId) {
    await prisma.task.update({
      where: { id: taskId },
      data: { description, dueDate: responseDue(rec.acceptedAt), ...(docIds[0] ? { documentId: docIds[0] } : {}) },
    }).catch(() => undefined);
  } else if (wantTask) {
    const task = await prisma.task.create({
      data: {
        clientId: acc.clientId,
        title: `Datová schránka: ${rec.sender || "nová zpráva"}${rec.subject ? ` — ${rec.subject}` : ""}`.slice(0, 200),
        description,
        dueDate: responseDue(rec.acceptedAt),
        priority: rec.personalDelivery ? "high" : "normal",
        status: "pending",
        createdBy: "system",
        source: "databox",
        documentId: docIds[0] ?? null,
      },
    });
    taskId = task.id;
    createdTask = true;
  }

  const data = {
    dataBoxId: acc.dataBoxId,
    dataBoxName: acc.name,
    clientId: acc.clientId,
    sender: rec.sender,
    subject: rec.subject,
    deliveredAt: rec.deliveredAt,
    acceptedAt: rec.acceptedAt,
    downloadedAt: retryLater ? null : new Date(),
    attachments: files.length,
    accountId: acc.id,
    taskId,
  };
  if (existing) await prisma.dataBoxMessage.update({ where: { id: existing.id }, data });
  else await prisma.dataBoxMessage.create({ data: { messageId: rec.id, ...data } });

  if (createdTask && taskId) {
    const html = [
      `📬 <b>Нове в датовій схранці «${esc(acc.name)}»</b>${rec.personalDelivery ? " ❗️" : ""}`,
      `Від: <b>${esc(rec.sender || "—")}</b>`,
      rec.subject ? `Справа: «${esc(rec.subject)}»` : "",
      `Доручено: <b>${rec.acceptedAt ? fmtDate(rec.acceptedAt) : "щойно"}</b> — строки вже йдуть.`,
      files.length ? `Вкладень: ${files.length} (є в задачі).` : downloadError ? "Вкладення не стягнулись — відкрий схранку." : "",
    ]
      .filter(Boolean)
      .join("\n");
    await notifyOwners("databox", taskId, html, [
      [
        { text: "✅ Прочитав, дій не треба", data: `TD:${taskId}` },
        { text: "📌 Є що робити", data: `TP:${taskId}` },
      ],
      [{ text: "Відкрити задачу", url: appUrl(`/tasks/${taskId}`) }],
    ]);
  }
  return createdTask;
}

export async function syncAllDataBoxAccounts() {
  const accounts = await prisma.dataBoxAccount.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  const out: Array<{ name: string } & DataBoxSyncResult> = [];
  for (const a of accounts) out.push({ name: a.name, ...(await syncDataBoxAccount(a)) });
  return out;
}

/** Щодня: нагадати, що за ≤ 14 днів спливе пароль до схранки (ISDS блокує вхід після експірації). */
export async function sendDataBoxPasswordReminders() {
  const soon = new Date(Date.now() + 14 * DAY);
  const accounts = await prisma.dataBoxAccount.findMany({ where: { isActive: true, passwordExpiresAt: { lte: soon } } });
  for (const a of accounts) {
    const left = Math.ceil((a.passwordExpiresAt!.getTime() - Date.now()) / DAY);
    await notifyOwners(
      "databox_password",
      a.id,
      `🔑 <b>Датова схранка «${esc(a.name)}»</b>: пароль спливає ${fmtDate(a.passwordExpiresAt!)}${left >= 0 ? ` (через ${left} дн.)` : " — вже сплив"}.\nЗміни пароль у схранці й онови його в Nastavení: ${appUrl("/settings")}`
    );
  }
  return { reminded: accounts.length };
}
