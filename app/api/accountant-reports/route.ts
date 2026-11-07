import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { parseEmails } from "@/lib/finance/accountant-report";

export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const b = await req.json();
  if (!b.clientId || !(await prisma.client.findUnique({ where: { id: String(b.clientId) } }))) throw new HttpError(400, "Vyberte firmu");
  const day = Math.min(28, Math.max(1, Number(b.dayOfMonth) || 10));
  const r = await prisma.accountantReport.create({
    data: {
      clientId: String(b.clientId),
      email: parseEmails(b.email),
      dayOfMonth: day,
      senderInboxId: b.senderInboxId || null,
      attachZip: b.attachZip !== false,
      note: b.note ? String(b.note).slice(0, 1000) : null,
    },
  });
  return NextResponse.json({ ok: true, id: r.id });
});
