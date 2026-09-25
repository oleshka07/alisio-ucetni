import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { recomputeTransaction } from "@/lib/docs/rules";
import { DOC_TYPES } from "@/lib/docs/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * action:
 *  not_needed | needed — документ не потрібен / знову потрібен
 *  reviewed | unreviewed — бухгалтер перевірив
 *  snooze — відкласти нагадування на N днів
 *  update — note, requiredDocs
 */
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff();
  const { id } = await params;
  const body = await req.json();
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) throw new HttpError(404, "Platba nenalezena");

  switch (body.action) {
    case "not_needed":
      await prisma.transaction.update({ where: { id }, data: { docStatus: "not_needed", docStatusManual: true } });
      break;
    case "needed":
      await prisma.transaction.update({
        where: { id },
        data: { docStatusManual: false, requiredDocs: tx.requiredDocs.length ? tx.requiredDocs : ["other"] },
      });
      await recomputeTransaction(id);
      break;
    case "reviewed":
      await prisma.transaction.update({ where: { id }, data: { reviewedAt: new Date() } });
      break;
    case "unreviewed":
      await prisma.transaction.update({ where: { id }, data: { reviewedAt: null } });
      break;
    case "snooze": {
      const days = Math.min(Math.max(Number(body.days) || 3, 1), 60);
      await prisma.transaction.update({ where: { id }, data: { snoozedUntil: new Date(Date.now() + days * 86400_000) } });
      break;
    }
    case "update": {
      const data: Record<string, unknown> = {};
      if (typeof body.note === "string") data.note = body.note.slice(0, 2000) || null;
      if (Array.isArray(body.requiredDocs)) {
        data.requiredDocs = body.requiredDocs.filter((t: string) => t in DOC_TYPES);
        data.docStatusManual = false;
      }
      await prisma.transaction.update({ where: { id }, data });
      if (data.requiredDocs) await recomputeTransaction(id);
      break;
    }
    default:
      throw new HttpError(400, "Neznámá akce");
  }
  revalidatePath("/transactions");
  revalidatePath(`/transactions/${id}`);
  return NextResponse.json({ ok: true });
});
