import { NextResponse } from "next/server";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { getMe, setCommands, setWebhook, telegramEnabled } from "@/lib/telegram/api";
import { appUrl } from "@/lib/format";

export const POST = handle(async () => {
  await requireStaff(["owner"]);
  if (!telegramEnabled()) throw new HttpError(400, "TELEGRAM_BOT_TOKEN není nastaven");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(400, "TELEGRAM_WEBHOOK_SECRET není nastaven");
  const url = appUrl("/api/telegram/webhook");
  await setWebhook(url, secret);
  await setCommands();
  const me = await getMe();
  return NextResponse.json({ ok: true, webhook: url, bot: me.username });
});
