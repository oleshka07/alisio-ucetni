#!/bin/bash
# Platba Booking.com 02.09.2026 (QA Glamping): omylem přiřazená faktura-2026-683 — odpojit. Tiskne jen ID a stav.
set -eu
cd /root/projects/alisio-ucetni
set -a; . ./.env; set +a
export POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
cat > /tmp/fixups.ts <<'TS'
import { prisma } from "@/lib/prisma";
import { unlinkDocument } from "@/lib/docs/ingest";
const TX = "cmv99a91f000p2f1l7m1ierrg";
(async () => {
  const links = await prisma.transactionDocument.findMany({ where: { transactionId: TX }, include: { document: true } });
  for (const l of links) {
    if (!/2026-683/.test(l.document.originalName)) { console.log(l.documentId, "ponecháno"); continue; }
    await unlinkDocument(TX, l.documentId);
    const tx = await prisma.transaction.findUnique({ where: { id: TX }, select: { docStatus: true } });
    console.log(l.documentId, "odpojeno, platba:", tx?.docStatus);
  }
  await prisma.$disconnect();
})();
TS
cp /tmp/fixups.ts ./.fixups.ts && npx tsx ./.fixups.ts; rm -f ./.fixups.ts /tmp/fixups.ts
