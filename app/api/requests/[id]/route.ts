import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";

export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const { status } = await req.json();
  if (!["open", "fulfilled", "cancelled"].includes(status)) throw new HttpError(400, "Neplatný stav");
  const r = await prisma.documentRequest.update({
    where: { id },
    data: { status, fulfilledAt: status === "fulfilled" ? new Date() : null },
  });
  if (r.transactionId) revalidatePath(`/transactions/${r.transactionId}`);
  return NextResponse.json({ ok: true });
});
