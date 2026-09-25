import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff } from "@/lib/guard";
import { ensureSystemRules, pickRule, recomputeTransaction } from "@/lib/docs/rules";

export const maxDuration = 60;

/** Після зміни правил — перерахувати операції без ручного статусу. */
export const POST = handle(async () => {
  await requireStaff(["owner"]);
  await ensureSystemRules();
  const rules = await prisma.docRequirementRule.findMany({ where: { isActive: true } });
  const own = (await prisma.bankAccount.findMany({ select: { accountNumber: true, iban: true } }))
    .flatMap((a) => [a.accountNumber, a.iban])
    .filter((x): x is string => !!x);
  const txs = await prisma.transaction.findMany({ where: { docStatusManual: false } });
  let changed = 0;
  for (const tx of txs) {
    const o = pickRule(rules, { ...tx, amount: Number(tx.amount) }, own);
    if (o.ruleId !== tx.ruleId || o.category !== tx.category || o.requiredDocs.join() !== tx.requiredDocs.join()) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { ruleId: o.ruleId, category: o.category, requiredDocs: o.requiredDocs, docHint: o.docHint },
      });
      await recomputeTransaction(tx.id);
      changed++;
    }
  }
  return NextResponse.json({ ok: true, checked: txs.length, changed });
});
