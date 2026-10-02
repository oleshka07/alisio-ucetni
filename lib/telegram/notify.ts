import type { Transaction, Client, DocumentRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, fmtAmount, fmtDate } from "@/lib/format";
import { docTypeLabel } from "@/lib/docs/types";
import type { IngestResult } from "@/lib/docs/ingest";
import { esc, sendMessage, telegramEnabled, type Keyboard } from "./api";

/** Повідомлення українською — їх читає власник. */

export function txLine(tx: Transaction & { client?: Pick<Client, "name"> | null }): string {
  const who = tx.counterpartyName || tx.message || tx.counterpartyAccount || "—";
  const company = tx.client ? ` · ${esc(tx.client.name)}` : "";
  return `${fmtDate(tx.bookingDate)} <b>${fmtAmount(tx.amount.toString(), tx.currency)}</b> ${esc(who.slice(0, 60))}${company}`;
}

export function txButtons(txId: string): Keyboard {
  return [
    [
      { text: "📎 Завантажити", data: `U:${txId}` },
      { text: "⏰ +3 дні", data: `S:${txId}` },
      { text: "🚫 Не потрібно", data: `N:${txId}` },
    ],
  ];
}

async function ownersWithTelegram() {
  return prisma.user.findMany({ where: { role: "owner", isActive: true, telegramChatId: { not: null } } });
}

async function log(userId: string | null, kind: string, refId: string | null, text: string, ok: boolean, error?: string) {
  await prisma.notificationLog.create({ data: { userId, kind, refId, text: text.slice(0, 2000), ok, error } });
}

export async function notifyOwners(kind: string, refId: string | null, html: string, kb?: Keyboard) {
  if (!telegramEnabled()) return 0;
  let sent = 0;
  for (const u of await ownersWithTelegram()) {
    try {
      await sendMessage(u.telegramChatId!, html, kb);
      await log(u.id, kind, refId, html, true);
      sent++;
    } catch (e) {
      await log(u.id, kind, refId, html, false, e instanceof Error ? e.message : String(e));
    }
  }
  return sent;
}

/** Текст результату обробки документа + кнопки вибору операції. */
export function ingestReply(r: IngestResult): { html: string; kb: Keyboard } {
  const d = r.document;
  const lines: string[] = [];
  const kb: Keyboard = [];

  if (r.duplicate) lines.push("♻️ <b>Цей файл уже є в системі</b> — дубль не створюю.");
  else lines.push(`📄 <b>${esc(docTypeLabel(d.docType, "uk"))}</b>${d.extractedNumber ? ` № ${esc(d.extractedNumber)}` : ""}`);

  const facts = [
    d.extractedCounterparty && esc(d.extractedCounterparty),
    d.extractedAmount != null && `${Number(d.extractedAmount).toLocaleString("cs-CZ")} ${esc(d.extractedCurrency || "")}`,
    d.extractedDate && fmtDate(d.extractedDate),
    d.extractedVs && `VS ${esc(d.extractedVs)}`,
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(" · "));
  if (d.aiStatus === "failed") lines.push("⚠️ Не вдалося розпізнати — прив'яжіть вручну в застосунку.");

  if (r.linkedTo.length) {
    lines.push("", r.autoLinked ? "✅ <b>Автоматично прив'язав до:</b>" : "✅ <b>Прив'язано до:</b>");
    for (const tx of r.linkedTo) lines.push("• " + txLine(tx));
  } else if (r.candidates.length) {
    lines.push("", "До якого платежу це відноситься?");
    r.candidates.slice(0, 4).forEach((c, i) => {
      lines.push(`${i + 1}. ${txLine(c.tx)} <i>(${c.reasons.join(", ")})</i>`);
      kb.push([{ text: `${i + 1}. ${fmtAmount(c.tx.amount.toString(), c.tx.currency)} · ${fmtDate(c.tx.bookingDate)}`, data: `L:${d.id}:${c.tx.id}` }]);
    });
    kb.push([{ text: "Жоден / пізніше", data: `X:${d.id}` }]);
  } else {
    lines.push("", "Підходящого платежу поки немає — документ лежить у «Nepřiřazené doklady». Прив'яжу, коли прийде виписка.");
  }
  kb.push([{ text: "Відкрити в застосунку", url: appUrl(r.linkedTo[0] ? `/transactions/${r.linkedTo[0].id}` : "/inbox") }]);
  return { html: lines.join("\n"), kb };
}

export async function notifyNewRequest(req: DocumentRequest & { transaction: (Transaction & { client: Client }) | null; client: Client }) {
  const lines = [
    "🧾 <b>Бухгалтер просить документ</b>",
    esc(req.message),
  ];
  if (req.docType) lines.push(`Тип: ${esc(docTypeLabel(req.docType, "uk"))}`);
  if (req.transaction) lines.push("", txLine(req.transaction));
  else lines.push(`Компанія: ${esc(req.client.name)}`);
  const kb: Keyboard = req.transaction ? txButtons(req.transaction.id) : [];
  kb.push([{ text: "Відкрити", url: appUrl(req.transaction ? `/transactions/${req.transaction.id}` : "/transactions") }]);
  return notifyOwners("request", req.id, lines.join("\n"), kb);
}

/** Дайджест: платежі без документів + відкриті запити. Пн і чт. */
export async function buildDigest(limit = 10): Promise<{ html: string; kb: Keyboard; total: number } | null> {
  const now = new Date();
  const where = {
    docStatus: { in: ["missing", "partial"] },
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
  };
  const soon = new Date(now.getTime() + 14 * 86400_000);
  const [total, byClient, oldest, openReq, tasks, taxSoon] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["clientId"], where, _count: true }),
    prisma.transaction.findMany({ where, orderBy: { bookingDate: "asc" }, take: limit, include: { client: true } }),
    prisma.documentRequest.findMany({
      where: { status: "open" },
      include: { transaction: { include: { client: true } }, client: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        status: { in: ["pending", "in_progress"] },
        OR: [{ dueDate: { lte: soon } }, { source: "databox" }],
      },
      orderBy: [{ dueDate: "asc" }],
      take: 8,
    }),
    prisma.taxEvent.findMany({ where: { status: "upcoming", dueDate: { lte: soon } }, include: { client: true }, orderBy: { dueDate: "asc" }, take: 10 }),
  ]);
  if (!total && !openReq.length && !tasks.length && !taxSoon.length) return null;

  const clients = await prisma.client.findMany({ where: { id: { in: byClient.map((b) => b.clientId) } } });
  const name = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  const lines: string[] = [];
  if (taxSoon.length) {
    lines.push("🧾 <b>Податкові строки (14 днів)</b>");
    for (const e of taxSoon) lines.push(`• ${fmtDate(e.dueDate)} — ${esc(e.title.slice(0, 80))} · ${esc(e.client.name)}${e.dueDate < now ? " ❗️" : ""}`);
    lines.push("");
  }
  if (tasks.length) {
    lines.push("🔔 <b>Не забути</b>");
    for (const t of tasks) {
      const due = t.dueDate ? ` — до ${fmtDate(t.dueDate)}` : "";
      const overdue = t.dueDate && t.dueDate < now ? " ❗️" : "";
      lines.push(`• ${esc(t.title.slice(0, 90))}${due}${overdue}`);
    }
    lines.push("");
  }
  lines.push(`📋 <b>Документи до платежів</b> — бракує ${total}`);
  for (const b of byClient) lines.push(`• ${esc(name(b.clientId))}: ${b._count}`);

  if (openReq.length) {
    lines.push("", `🧾 <b>Запити бухгалтера (${openReq.length})</b>`);
    for (const r of openReq.slice(0, 5)) {
      const days = Math.floor((now.getTime() - r.createdAt.getTime()) / 86400_000);
      lines.push(`• ${esc(r.message.slice(0, 80))}${days ? ` <i>(${days} дн.)</i>` : ""}`);
    }
  }

  if (oldest.length) {
    lines.push("", "<b>Найстаріші:</b>");
    for (const tx of oldest) {
      lines.push(`• ${txLine(tx)}`);
      if (tx.docHint) lines.push(`  <i>${esc(tx.docHint)}</i>`);
    }
  }
  lines.push("", "Надішліть файл сюди — я сам знайду платіж. Або /missing, щоб вибрати.");

  const kb: Keyboard = [
    [{ text: "Вибрати платіж і завантажити", data: "M" }],
    [{ text: "Відкрити список", url: appUrl("/transactions?status=open") }],
  ];
  return { html: lines.join("\n"), kb, total };
}

export async function sendDigest(force = false) {
  const digest = await buildDigest();
  if (!digest) return { sent: 0, total: 0 };
  // не частіше ніж раз на 20 год (захист від подвійного cron)
  if (!force) {
    const recent = await prisma.notificationLog.findFirst({
      where: { kind: "digest", ok: true, createdAt: { gt: new Date(Date.now() - 20 * 3600_000) } },
    });
    if (recent) return { sent: 0, total: digest.total, skipped: "recent" };
  }
  const sent = await notifyOwners("digest", null, digest.html, digest.kb);
  await prisma.documentRequest.updateMany({
    where: { status: "open" },
    data: { remindCount: { increment: 1 }, lastRemindedAt: new Date() },
  });
  return { sent, total: digest.total };
}

/**
 * Щодня: задачі, у яких дедлайн (фікція доручення, податок) за ≤ 2 дні або вже минув.
 * Кожну — окремим повідомленням з кнопками, не частіше разу на день.
 */
export async function sendUrgentReminders() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const horizon = new Date(now.getTime() + 2 * 86400_000);
  const tasks = await prisma.task.findMany({
    where: {
      status: { in: ["pending", "in_progress"] },
      dueDate: { lte: horizon },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: startOfDay } }],
    },
    include: { client: true },
    orderBy: { dueDate: "asc" },
    take: 15,
  });
  let sent = 0;
  for (const t of tasks) {
    const days = t.dueDate ? Math.round((t.dueDate.getTime() - startOfDay.getTime()) / 86400_000) : null;
    const when = days == null ? "" : days < 0 ? `прострочено на ${-days} дн.` : days === 0 ? "сьогодні" : `через ${days} дн.`;
    const html = [`⏰ <b>${esc(t.title)}</b>`, `Строк: ${fmtDate(t.dueDate)} (${when})`, `Компанія: ${esc(t.client.name)}`].join("\n");
    sent += await notifyOwners("reminder", t.id, html, [
      [
        { text: "✅ Зроблено", data: `TD:${t.id}` },
        { text: "📌 В роботі", data: `TP:${t.id}` },
      ],
      [{ text: "Відкрити", url: appUrl(`/tasks/${t.id}`) }],
    ]);
    await prisma.task.update({ where: { id: t.id }, data: { lastRemindedAt: now } });
  }
  return { tasks: tasks.length, sent };
}

/**
 * Податкові строки: нагадування за 7 днів, за 2 дні, у день строку і щодня після (прострочено),
 * не частіше разу на день. Кнопка «Готово» закриває строк.
 */
export async function sendTaxReminders() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const events = await prisma.taxEvent.findMany({
    where: {
      status: "upcoming",
      dueDate: { lte: new Date(today.getTime() + 7 * 86400_000) },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: today } }],
    },
    include: { client: true },
    orderBy: { dueDate: "asc" },
    take: 30,
  });
  let sent = 0;
  for (const e of events) {
    const days = Math.round((e.dueDate.getTime() - today.getTime()) / 86400_000);
    if (![7, 2, 0].includes(days) && days > 0) continue; // 6, 5, 4, 3, 1 день — без повідомлення
    const when = days < 0 ? `прострочено на ${-days} дн. ❗️` : days === 0 ? "сьогодні" : `через ${days} дн.`;
    const what = [e.files && "подати", e.pays && "сплатити"].filter(Boolean).join(" і ");
    const html = [`🧾 <b>${esc(e.title)}</b>`, `Строк: ${fmtDate(e.dueDate)} (${when})${what ? ` — ${what}` : ""}`, `Компанія: ${esc(e.client.name)}`, e.note ? `<i>${esc(e.note)}</i>` : ""]
      .filter(Boolean)
      .join("\n");
    sent += await notifyOwners("tax_reminder", e.id, html, [
      [{ text: e.pays ? "✅ Сплачено" : "✅ Подано", data: `XD:${e.id}` }],
      [{ text: "Календар", url: appUrl("/calendar") }],
    ]);
    await prisma.taxEvent.update({ where: { id: e.id }, data: { lastRemindedAt: now } });
  }
  return { events: events.length, sent };
}

/**
 * Стан синхронізації рахунку / скриньки → Telegram.
 * Збій з'єднання — лише з 2-го поспіль (≈30 хв), щоб разові таймаути не спамили; відновлення — коли було сповіщення.
 * Примітки (виписка не пройшла звірку, чужий рахунок) — одразу: це разова подія з конкретним файлом.
 */
export async function reportSyncHealth(opts: {
  kind: "bank" | "inbox";
  refId: string;
  name: string;
  prevFailCount: number;
  error?: string | null;
  notes?: string[];
}): Promise<number> {
  const what = opts.kind === "bank" ? "Рахунок" : "Скринька";
  const where = appUrl(opts.kind === "bank" ? "/statements" : "/settings");
  if (opts.error) {
    const failCount = opts.prevFailCount + 1;
    if (failCount === 2) {
      await notifyOwners(
        "sync_error",
        opts.refId,
        `⚠️ <b>${what} «${esc(opts.name)}»: синхронізація не працює</b>\n${esc(opts.error.slice(0, 300))}\n\nПеревірте налаштування: ${where}`
      );
    }
    return failCount;
  }
  if (opts.prevFailCount >= 2) {
    await notifyOwners("sync_ok", opts.refId, `✅ ${what} «${esc(opts.name)}»: синхронізація знову працює`);
  }
  if (opts.notes?.length) {
    await notifyOwners(
      "sync_note",
      opts.refId,
      `⚠️ <b>${what} «${esc(opts.name)}»</b>\n${opts.notes.slice(0, 5).map((n) => `• ${esc(n.slice(0, 300))}`).join("\n")}\n\n${where}`
    );
  }
  return 0;
}
