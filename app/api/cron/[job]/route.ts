import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isCronRequest } from "@/lib/guard";
import { syncAllBankAccounts } from "@/lib/bank/sync";
import { syncAllDocumentInboxes } from "@/lib/docs/inbox-sync";
import { sendDigest, sendUrgentReminders } from "@/lib/telegram/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Фонові задачі. Викликаються Vercel Cron (GET + Authorization: Bearer CRON_SECRET),
 * crontab/n8n на VPS (?key=CRON_SECRET) або власником з інтерфейсу (POST).
 *   /api/cron/sync    — виписки + пошта з документами
 *   /api/cron/digest  — нагадування в Telegram (пн, чт)
 *   /api/cron/reminders — щодня: дедлайни ≤ 2 дні (фікція доручення, податки)
 */
async function run(job: string, force: boolean) {
  switch (job) {
    case "sync":
      return { bank: await syncAllBankAccounts(), inboxes: await syncAllDocumentInboxes() };
    case "bank-sync":
      return { bank: await syncAllBankAccounts() };
    case "inbox-sync":
      return { inboxes: await syncAllDocumentInboxes() };
    case "digest":
      return { digest: await sendDigest(force) };
    case "reminders":
      return { reminders: await sendUrgentReminders() };
    default:
      return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  const result = await run(job, false);
  return result ? NextResponse.json({ ok: true, ...result }) : NextResponse.json({ error: "Unknown job" }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const session = await getSession();
  if (!isCronRequest(req) && session?.role !== "owner" && session?.role !== "accountant") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { job } = await params;
  const result = await run(job, true);
  return result ? NextResponse.json({ ok: true, ...result }) : NextResponse.json({ error: "Unknown job" }, { status: 404 });
}
