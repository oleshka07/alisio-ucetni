#!/bin/bash
# Swipe Scape: faktury, kde odběratelem není firma (Google, ElevenLabs — soukromě), do archivu;
# DEK 29.09 (548 Kč) — ruční platba hotově. Tiskne jen ID a stav.
set -eu
cd /root/projects/alisio-ucetni
set -a; . ./.env; set +a
export POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
cat > /tmp/fixups.ts <<'TS'
import { prisma } from "@/lib/prisma";
import { createManualPayment } from "@/lib/docs/manual-payment";
const NOT_FIRM = [
  "cmv9cnage000jrbap2bnrt9um", // Google 06/2026
  "cmv9cn1fq000brbapdsnzns0d", // Google 07/2026
  "cmv9cmwty0007rbapc4wmesmz", // Google 08/2026
  "cmuqk0b1u000712fmqxdib3t0", // Google 09/2026
  "cmv9cn5z3000frbaph5fnw8su", // ElevenLabs 08/2026 účtenka
  "cmv9cn3w4000drbapuojfj8z1", // ElevenLabs 08/2026 faktura
];
const CASH = "cmuow4dix0001rp8nzjhfq3xo"; // DEK 29.09.2026
(async () => {
  for (const id of NOT_FIRM) {
    const d = await prisma.document.findUnique({ where: { id }, include: { links: true } });
    const cust = String(((d?.extracted ?? {}) as Record<string, unknown>).customerName ?? "");
    if (!d || d.archivedAt || d.links.length || /swipe/i.test(cust)) { console.log(id, "přeskočeno"); continue; }
    await prisma.document.update({
      where: { id },
      data: { archivedAt: new Date(), description: [d.description, "Odběratel není firma (placeno soukromě) — doklad k firmě nepatří."].filter(Boolean).join(" ") },
    });
    console.log(id, "archivováno");
  }
  const dek = await prisma.document.findUnique({ where: { id: CASH } });
  if (dek) {
    try { const tx = await createManualPayment(dek, "cash"); console.log(CASH, "ruční platba hotově", tx.id, tx.docStatus); }
    catch (e) { console.log(CASH, "CHYBA", e instanceof Error ? e.message.slice(0, 200) : e); }
  }
  await prisma.$disconnect();
})();
TS
cp /tmp/fixups.ts ./.fixups.ts && npx tsx ./.fixups.ts; rm -f ./.fixups.ts /tmp/fixups.ts
