import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { buildMonthZip } from "@/lib/finance/month-export";

export const maxDuration = 60;

/** ZIP za місяць для бухгалтера: platby.csv + документи по платежах + оригінали виписок + документи без платежу. */
export const GET = handle(async (req: NextRequest) => {
  await requireStaff();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const month = url.searchParams.get("month") || "";
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "clientId a month (YYYY-MM) jsou povinné");
  if (!(await prisma.client.findUnique({ where: { id: clientId } }))) throw new HttpError(404, "Firma nenalezena");
  const z = await buildMonthZip(clientId, month);
  return new NextResponse(z.buf as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${z.fileName}"` },
  });
});
