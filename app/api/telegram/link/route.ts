import { NextResponse } from "next/server";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { getMe, telegramEnabled } from "@/lib/telegram/api";
import { linkToken } from "@/lib/telegram/bot";

export const GET = handle(async () => {
  const session = await requireStaff();
  if (!telegramEnabled()) throw new HttpError(400, "TELEGRAM_BOT_TOKEN není nastaven");
  const username = process.env.TELEGRAM_BOT_USERNAME || (await getMe()).username;
  return NextResponse.json({ url: `https://t.me/${username}?start=${linkToken(session.userId!)}`, bot: username });
});
