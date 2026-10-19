#!/bin/bash
# Jen čtení: kdo je odběratelem na nepřiřazených fakturách (Hetzner, Google, ElevenLabs, DEK…) firmy Swipe Scape.
# Jméno odběratele se tiskne maskované (logy jsou veřejné) — jen zda obsahuje „swipe“ a první písmena.
set -eu
cd /root/projects/alisio-ucetni
set -a; . ./.env; set +a
export POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
cat > /tmp/docs-payer.ts <<'TS'
import { prisma } from "@/lib/prisma";
const mask = (s: unknown) => (typeof s === "string" && s ? `${s.slice(0, 3)}…(${s.length})` : "—");
(async () => {
  const firm = await prisma.client.findFirst({ where: { name: { contains: "swipe", mode: "insensitive" } }, select: { id: true } });
  if (!firm) return console.log("firma nenalezena");
  const docs = await prisma.document.findMany({
    where: { clientId: firm.id, links: { none: {} }, archivedAt: null, companyDoc: false },
    orderBy: { extractedDate: "asc" },
  });
  for (const d of docs) {
    const x = (d.extracted ?? {}) as Record<string, unknown>;
    const cust = typeof x.customerName === "string" ? x.customerName : "";
    console.log([
      d.id, d.extractedDate?.toISOString().slice(0, 10), d.docType, d.extractedAmount?.toString(), d.extractedCurrency,
      `dodavatel=${d.extractedCounterparty ?? "—"}`,
      `odběratel swipe=${/swipe/i.test(cust)}`, `odběratel=${/swipe/i.test(cust) ? cust : mask(cust)}`,
      `ičo=${x.customerIco ? "ano" : "ne"}`,
    ].join(" | "));
  }
  await prisma.$disconnect();
})();
TS
cp /tmp/docs-payer.ts ./.docs-payer.ts && npx tsx ./.docs-payer.ts; rm -f ./.docs-payer.ts /tmp/docs-payer.ts
