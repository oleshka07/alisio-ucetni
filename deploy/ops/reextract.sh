#!/bin/bash
# Znovu rozpoznat nerozpoznané doklady (aiStatus = failed) — po opravě AI. Vypisuje jen stav, ne obsah.
set -eu
cd /root/projects/alisio-ucetni
set -a; . ./.env; set +a
export POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
cat > /tmp/reextract.ts <<'TS'
import { prisma } from "@/lib/prisma";
import { reprocessDocument } from "@/lib/docs/ingest";
(async () => {
  const docs = await prisma.document.findMany({ where: { aiStatus: "failed", archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 });
  for (const d of docs) {
    try {
      const r = await reprocessDocument(d.id);
      console.log(d.id, r.document.aiStatus, r.document.docType, r.document.extractedAmount?.toString(), r.document.extractedCurrency, "autoLinked:", !!r.autoLinked, "candidates:", r.candidates.length);
    } catch (e) {
      console.log(d.id, "ERROR", e instanceof Error ? e.message.replace(/sk-[A-Za-z0-9_*.-]+/g, "sk-***").slice(0, 200) : e);
    }
  }
  await prisma.$disconnect();
})();
TS
cp /tmp/reextract.ts ./.reextract.ts && npx tsx ./.reextract.ts; rm -f ./.reextract.ts /tmp/reextract.ts
