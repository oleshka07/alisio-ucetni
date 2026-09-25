/**
 * Мінімальний клієнт Telegram Bot API (без залежностей).
 * Токен: TELEGRAM_BOT_TOKEN. Окремий бот від @kemptimebot.
 */

export type Button = { text: string; data?: string; url?: string };
export type Keyboard = Button[][];

export function telegramEnabled(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

function markup(kb?: Keyboard) {
  if (!kb || !kb.length) return undefined;
  return {
    inline_keyboard: kb.map((row) =>
      row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))
    ),
  };
}

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendMessage(chatId: string | number, html: string, kb?: Keyboard) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: markup(kb),
  });
}

export async function editMessage(chatId: string | number, messageId: number, html: string, kb?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: markup(kb) ?? { inline_keyboard: [] },
  }).catch(() => undefined); // "message is not modified" — не помилка
}

export async function answerCallback(id: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);
}

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
  const file = await call<{ file_path: string; file_size?: number }>("getFile", { file_id: fileId });
  if (file.file_size && file.file_size > 20 * 1024 * 1024) throw new Error("Файл більший за 20 МБ");
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error(`Telegram file download ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), filePath: file.file_path };
}

export async function setWebhook(url: string, secret: string) {
  return call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function getMe() {
  return call<{ username: string; first_name: string }>("getMe", {});
}

export async function setCommands() {
  return call("setMyCommands", {
    commands: [
      { command: "missing", description: "Платежі без документів" },
      { command: "requests", description: "Запити бухгалтера" },
      { command: "cancel", description: "Скасувати очікування файлу" },
      { command: "help", description: "Як це працює" },
    ],
  });
}
