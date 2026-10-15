import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/guard";
import { matchTaxPayments } from "@/lib/tax/sync";

/**
 * Účet byl založen u špatné firmy → přesunout ho i s platbami.
 * S platbami jdou doklady k nim přiřazené (jen ty, co patřily staré firmě) a žádosti o doklad.
 * Daňové termíny staré firmy, které tyto platby „zaplatily“, se vrátí na nezaplacené.
 */
export async function moveBankAccount(accountId: string, clientId: string) {
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new HttpError(404, "Účet nenalezen");
  if (account.clientId === clientId) return { moved: 0 };
  const target = await prisma.client.findUnique({ where: { id: clientId } });
  if (!target) throw new HttpError(400, "Firma nenalezena");
  const from = account.clientId;

  const moved = await prisma.$transaction(async (tx) => {
    const txIds = (await tx.transaction.findMany({ where: { bankAccountId: accountId }, select: { id: true } })).map((t) => t.id);
    await tx.bankAccount.update({ where: { id: accountId }, data: { clientId } });
    if (!txIds.length) return 0;
    await tx.transaction.updateMany({ where: { id: { in: txIds } }, data: { clientId } });
    const docIds = (await tx.transactionDocument.findMany({ where: { transactionId: { in: txIds } }, select: { documentId: true } })).map((l) => l.documentId);
    if (docIds.length) await tx.document.updateMany({ where: { id: { in: docIds }, clientId: from }, data: { clientId } });
    await tx.documentRequest.updateMany({ where: { transactionId: { in: txIds } }, data: { clientId } });
    await tx.taxEvent.updateMany({
      where: { clientId: from, paidTransactionId: { in: txIds } },
      data: { paidTransactionId: null, status: "upcoming", doneAt: null },
    });
    return txIds.length;
  });

  await matchTaxPayments(clientId).catch((e) => console.error("matchTaxPayments", e));
  return { moved };
}
