import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { decryptSecret } from "@/lib/crypto";
import { testImap } from "@/lib/mail/imap";

export const maxDuration = 30;

export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const a = await prisma.bankAccount.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Účet nenalezen");
  if (!a.imapHost || !a.imapUser || !a.imapPasswordEnc) throw new HttpError(400, "IMAP není nastaven");
  return NextResponse.json(
    await testImap({ host: a.imapHost, port: a.imapPort || 993, user: a.imapUser, password: decryptSecret(a.imapPasswordEnc), folder: a.imapFolder || "INBOX" })
  );
});
