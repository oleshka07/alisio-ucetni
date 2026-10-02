import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { deleteFile } from "@/lib/storage";

/**
 * Видалити помилково завантажену виписку разом з її платежами (лише власник).
 * Документи, прив'язані до цих платежів, лишаються — повертаються в «Nepřiřazené doklady».
 */
export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const st = await prisma.bankStatement.findUnique({ where: { id } });
  if (!st) throw new HttpError(404, "Výpis nenalezen");
  const { count } = await prisma.transaction.deleteMany({ where: { statementId: id } });
  await prisma.bankStatement.delete({ where: { id } });
  if (st.fileUrl && !(await prisma.bankStatement.count({ where: { fileUrl: st.fileUrl } }))) {
    await deleteFile(st.fileUrl).catch((e) => console.error("deleteFile", e));
  }
  revalidatePath("/statements");
  revalidatePath("/transactions");
  return NextResponse.json({ ok: true, deletedTransactions: count });
});
