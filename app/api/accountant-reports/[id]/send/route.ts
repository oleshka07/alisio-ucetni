import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { previousMonth, sendAccountantReport } from "@/lib/finance/accountant-report";

export const maxDuration = 120;

/** „Odeslat teď“ — za zvolený měsíc (výchozí minulý). */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const month = typeof b.month === "string" && /^\d{4}-\d{2}$/.test(b.month) ? b.month : previousMonth();
  const r = await prisma.accountantReport.findUnique({ where: { id }, include: { senderInbox: true } });
  if (!r) throw new HttpError(404, "Nastavení nenalezeno");
  const res = await sendAccountantReport(r, month);
  if (!res.ok) throw new HttpError(400, res.error);
  return NextResponse.json(res);
});
