import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { notifyNewRequest } from "@/lib/telegram/notify";

/** Бухгалтер (або власник) просить документ → миттєво в Telegram власнику. */
export const POST = handle(async (req: NextRequest) => {
  const session = await requireStaff();
  const body = await req.json();
  const message = String(body.message || "").trim();
  if (!message) throw new HttpError(400, "Napište, jaký doklad chybí");
  let clientId: string | null = body.clientId || null;
  const transactionId: string | null = body.transactionId || null;
  if (transactionId) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new HttpError(404, "Platba nenalezena");
    clientId = tx.clientId;
  }
  if (!clientId) throw new HttpError(400, "Vyberte firmu");

  const request = await prisma.documentRequest.create({
    data: { clientId, transactionId, message: message.slice(0, 1000), docType: body.docType || null, requestedById: session.userId },
    include: { transaction: { include: { client: true } }, client: true },
  });
  const sent = await notifyNewRequest(request);
  revalidatePath("/transactions");
  if (transactionId) revalidatePath(`/transactions/${transactionId}`);
  return NextResponse.json({ ok: true, id: request.id, telegramSent: sent });
});
