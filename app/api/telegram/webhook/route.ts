import { NextRequest, NextResponse, after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { handleUpdate } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!secret || !safeEqual(got, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const update = await req.json();
  // Відповідаємо Telegram одразу, обробка (AI може тривати 5–20 с) — після відповіді
  after(async () => {
    try {
      await handleUpdate(update);
    } catch (e) {
      console.error("Telegram update failed", e);
    }
  });
  return NextResponse.json({ ok: true });
}
