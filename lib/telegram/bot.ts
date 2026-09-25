/* eslint-disable @typescript-eslint/no-explicit-any */
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { ingestDocument, linkDocument } from "@/lib/docs/ingest";
import { answerCallback, downloadFile, editMessage, esc, sendMessage, type Keyboard } from "./api";
import { ingestReply, txLine } from "./notify";

// ─── Прив'язка чату до користувача: /start <userId>_<hmac> ────────────────────

export function linkToken(userId: string): string {
  return `${userId}_${hmacHex(process.env.AUTH_SECRET || "", `tg:${userId}`).slice(0, 16)}`;
}

function verifyLinkToken(token: string): string | null {
  const i = token.lastIndexOf("_");
  if (i <= 0) return null;
  const userId = token.slice(0, i);
  return safeEqual(linkToken(userId), token) ? userId : null;
}

const HELP = [
  "🤖 <b>Alisio Účetnictví</b>",
  "",
  "• Надішліть фото або PDF документа — я розпізнаю його і знайду платіж.",
  "• /missing — платежі без документів, можна вибрати й завантажити.",
  "• /requests — що просить бухгалтер.",
  "• /cancel — скасувати очікування файлу.",
  "",
  "Двічі на тиждень (пн, чт) надсилаю список того, чого бракує.",
].join("\n");

async function sendMissing(chatId: number | string) {
  const txs = await prisma.transaction.findMany({
    where: {
      docStatus: { in: ["missing", "partial"] },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
    },
    orderBy: { bookingDate: "desc" },
    take: 8,
    include: { client: true },
  });
  if (!txs.length) return sendMessage(chatId, "🎉 Усі платежі мають документи.");
  const lines = ["<b>Платежі без документів</b> (натисніть номер, потім надішліть файл):", ""];
  const kb: Keyboard = [];
  txs.forEach((tx, i) => {
    lines.push(`${i + 1}. ${txLine(tx)}`);
    if (tx.docHint) lines.push(`   <i>${esc(tx.docHint)}</i>`);
  });
  for (let i = 0; i < txs.length; i += 4) {
    kb.push(txs.slice(i, i + 4).map((tx, j) => ({ text: `📎 ${i + j + 1}`, data: `U:${tx.id}` })));
  }
  return sendMessage(chatId, lines.join("\n"), kb);
}

async function sendRequests(chatId: number | string) {
  const reqs = await prisma.documentRequest.findMany({
    where: { status: "open" },
    include: { transaction: { include: { client: true } }, client: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (!reqs.length) return sendMessage(chatId, "Відкритих запитів від бухгалтера немає.");
  const lines = ["🧾 <b>Запити бухгалтера</b>", ""];
  const kb: Keyboard = [];
  reqs.forEach((r, i) => {
    lines.push(`${i + 1}. ${esc(r.message)}`);
    if (r.transaction) {
      lines.push(`   ${txLine(r.transaction)}`);
      kb.push([{ text: `📎 ${i + 1}`, data: `U:${r.transaction.id}` }]);
    }
  });
  return sendMessage(chatId, lines.join("\n"), kb);
}

async function handleFile(user: User, chatId: number, msg: any) {
  let fileId: string;
  let fileName: string;
  let mime: string;
  if (msg.document) {
    fileId = msg.document.file_id;
    fileName = msg.document.file_name || "document";
    mime = msg.document.mime_type || "application/octet-stream";
  } else {
    const photo = msg.photo[msg.photo.length - 1];
    fileId = photo.file_id;
    fileName = `foto_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
    mime = "image/jpeg";
  }

  const pending = await sendMessage(chatId, "⏳ Обробляю документ…");
  try {
    const { buffer } = await downloadFile(fileId);
    const awaiting = user.tgAwaitingTxId;
    const result = await ingestDocument({
      buffer,
      fileName,
      mimeType: mime,
      source: "telegram",
      uploadedBy: "telegram",
      transactionId: awaiting,
      description: msg.caption || null,
      linkedBy: "telegram",
    });
    if (awaiting) await prisma.user.update({ where: { id: user.id }, data: { tgAwaitingTxId: null } });
    const reply = ingestReply(result);
    await editMessage(chatId, pending.message_id, reply.html, reply.kb);
  } catch (e) {
    await editMessage(chatId, pending.message_id, `❌ Помилка: ${esc(e instanceof Error ? e.message : String(e))}`);
  }
}

async function handleCallback(user: User, cb: any) {
  const data: string = cb.data || "";
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const [kind, a, b] = data.split(":");

  if (kind === "U") {
    const tx = await prisma.transaction.findUnique({ where: { id: a }, include: { client: true } });
    if (!tx) return answerCallback(cb.id, "Платіж не знайдено");
    await prisma.user.update({ where: { id: user.id }, data: { tgAwaitingTxId: tx.id } });
    await answerCallback(cb.id);
    const hint = tx.docHint ? `\n<i>${esc(tx.docHint)}</i>` : "";
    return sendMessage(chatId, `📎 Надішліть файл для платежу:\n${txLine(tx)}${hint}\n\n/cancel — скасувати`);
  }
  if (kind === "S") {
    await prisma.transaction.update({ where: { id: a }, data: { snoozedUntil: new Date(Date.now() + 3 * 86400_000) } });
    return answerCallback(cb.id, "Нагадаю через 3 дні");
  }
  if (kind === "N") {
    await prisma.transaction.update({ where: { id: a }, data: { docStatus: "not_needed", docStatusManual: true } });
    return answerCallback(cb.id, "Позначено: документ не потрібен");
  }
  if (kind === "L") {
    await linkDocument(b, a, "telegram");
    const tx = await prisma.transaction.findUnique({ where: { id: b }, include: { client: true } });
    await answerCallback(cb.id, "Прив'язано");
    if (tx && messageId) await editMessage(chatId, messageId, `✅ Прив'язано до:\n${txLine(tx)}`);
    return;
  }
  if (kind === "X") {
    await answerCallback(cb.id, "Ок, документ у «Nepřiřazené doklady»");
    if (messageId) await editMessage(chatId, messageId, "📥 Документ збережено без прив'язки. Прив'яжу, коли з'явиться платіж.");
    return;
  }
  if (kind === "TD" || kind === "TP") {
    const task = await prisma.task.findUnique({ where: { id: a } });
    if (!task) return answerCallback(cb.id, "Задачу не знайдено");
    await prisma.task.update({
      where: { id: a },
      data: kind === "TD" ? { status: "done" } : { status: "in_progress", notes: [task.notes, "Přečteno — je potřeba reagovat"].filter(Boolean).join("\n") },
    });
    await answerCallback(cb.id, kind === "TD" ? "Закрито" : "Залишаю в списку, нагадуватиму");
    if (messageId && kind === "TD") await editMessage(chatId, messageId, `✅ Закрито: ${esc(task.title)}`);
    return;
  }
  if (kind === "M") {
    await answerCallback(cb.id);
    return sendMissing(chatId);
  }
  return answerCallback(cb.id);
}

export async function handleUpdate(update: any) {
  if (update.callback_query) {
    const cb = update.callback_query;
    const user = await prisma.user.findUnique({ where: { telegramChatId: String(cb.message?.chat?.id) } });
    if (!user || !user.isActive) return answerCallback(cb.id, "Немає доступу");
    return handleCallback(user, cb);
  }

  const msg = update.message;
  if (!msg?.chat) return;
  const chatId: number = msg.chat.id;
  if (msg.chat.type !== "private") return; // лише особисті чати
  const text: string = msg.text || "";

  let user = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) } });

  if (text.startsWith("/start")) {
    const token = text.split(/\s+/)[1];
    const userId = token ? verifyLinkToken(token) : null;
    if (userId) {
      await prisma.user.updateMany({ where: { telegramChatId: String(chatId) }, data: { telegramChatId: null } });
      user = await prisma.user.update({ where: { id: userId }, data: { telegramChatId: String(chatId) } });
      return sendMessage(chatId, `✅ Підключено: ${esc(user.name)}\n\n${HELP}`);
    }
    if (user) return sendMessage(chatId, HELP);
    return sendMessage(chatId, "Це приватний бот. Підключіть його в застосунку: Nastavení → Telegram.");
  }

  if (!user || !user.isActive) {
    return sendMessage(chatId, "Це приватний бот. Підключіть його в застосунку: Nastavení → Telegram.");
  }

  if (msg.document || msg.photo) return handleFile(user, chatId, msg);
  if (text.startsWith("/missing")) return sendMissing(chatId);
  if (text.startsWith("/requests")) return sendRequests(chatId);
  if (text.startsWith("/cancel")) {
    await prisma.user.update({ where: { id: user.id }, data: { tgAwaitingTxId: null } });
    return sendMessage(chatId, "Скасовано. Наступний файл я прив'яжу автоматично.");
  }
  return sendMessage(chatId, HELP);
}

