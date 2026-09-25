import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";


const FIELDS = {
  id: true, name: true, kind: true, clientId: true, imapHost: true, imapPort: true, imapUser: true, imapFolder: true,
  senderFilter: true, isActive: true, lastSyncAt: true, lastError: true,
} as const;

export const GET = handle(async () => {
  await requireStaff();
  return NextResponse.json({ inboxes: await prisma.documentInbox.findMany({ select: FIELDS, orderBy: { createdAt: "asc" } }) });
});

export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const b = await req.json();
  if (!b.imapHost || !b.imapUser || !b.imapPassword) throw new HttpError(400, "Vyplňte server, uživatele a heslo");
  const inbox = await prisma.documentInbox.create({
    data: {
      name: String(b.name || b.imapUser),
      kind: ["documents", "databox", "mixed"].includes(b.kind) ? b.kind : "documents",
      clientId: b.clientId || null,
      imapHost: String(b.imapHost).trim(),
      imapPort: Number(b.imapPort) || 993,
      imapUser: String(b.imapUser).trim(),
      imapPasswordEnc: encryptSecret(String(b.imapPassword)),
      imapFolder: String(b.imapFolder || "INBOX"),
      senderFilter: b.senderFilter || null,
    },
    select: FIELDS,
  });
  return NextResponse.json({ inbox });
});
