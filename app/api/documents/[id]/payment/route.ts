import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { createManualPayment, PAYMENT_METHODS, type PaymentMethod } from "@/lib/docs/manual-payment";

/** Документ оплачено мимо банку (готівка, приватна картка) → платіж із даних документа. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const { method } = await req.json();
  if (!(method in PAYMENT_METHODS)) throw new HttpError(400, "Neplatný způsob platby");
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.archivedAt) throw new HttpError(404, "Doklad nenalezen");
  try {
    const tx = await createManualPayment(doc, method as PaymentMethod);
    revalidatePath("/inbox");
    revalidatePath("/transactions");
    return NextResponse.json({ ok: true, transactionId: tx.id });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Chyba");
  }
});
