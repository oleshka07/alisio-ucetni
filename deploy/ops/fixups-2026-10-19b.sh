#!/bin/bash
# Swipe Scape: Hetzner (odběratel firma, placeno soukromou kartou) — ruční platby;
# faktury s jiným odběratelem než firma (Webglobe, Anthropic, Pohledávky) do archivu. Tiskne jen ID a stav.
set -eu
cd /root/projects/alisio-ucetni
set -a; . ./.env; set +a
export POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
cat > /tmp/fixups.ts <<'TS'
import { prisma } from "@/lib/prisma";
import { createManualPayment } from "@/lib/docs/manual-payment";
const PRIVATE_CARD = [
  "cmv9cn8ce000hrbapylx0tlpc", // Hetzner 07/2026
  "cmv9cmz4g0009rbap0fpsrj3m", // Hetzner 08/2026
  "cmv9cmuge0005rbapbg1r5v6d", // Hetzner 09/2026
  "cmurzg75p000j3iroj40ejg5a", // Hetzner 10/2026
];
const NOT_FIRM = [
  "cmuq2v6za000512fm7rdppagq", "cmuq2bspx000312fm6dwjs97z", "cmv9z9vz800034ouuc363viop", // Webglobe 10/2026
  "cmve7gc850003ycu1jh3eiriw", "cmve7gast0001ycu1v5yix1qj", // Anthropic 10/2026
  "cmuhmwrgu000qxjmd7easbwyq", // Pohledávky 03/2026
];
(async () => {
  for (const id of NOT_FIRM) {
    const d = await prisma.document.findUnique({ where: { id }, include: { links: true } });
    const cust = String(((d?.extracted ?? {}) as Record<string, unknown>).customerName ?? "");
    if (!d || d.archivedAt || d.links.length || /swipe/i.test(cust)) { console.log(id, "přeskočeno"); continue; }
    await prisma.document.update({
      where: { id },
      data: { archivedAt: new Date(), description: [d.description, "Odběratel není firma — doklad k firmě nepatří."].filter(Boolean).join(" ") },
    });
    console.log(id, "archivováno");
  }
  for (const id of PRIVATE_CARD) {
    const d = await prisma.document.findUnique({ where: { id } });
    if (!d) { console.log(id, "nenalezen"); continue; }
    try { const tx = await createManualPayment(d, "private_card"); console.log(id, "ruční platba soukromou kartou", tx.id); }
    catch (e) { console.log(id, "CHYBA", e instanceof Error ? e.message.slice(0, 200) : e); }
  }
  await prisma.$disconnect();
})();
TS
cp /tmp/fixups.ts ./.fixups.ts && npx tsx ./.fixups.ts; rm -f ./.fixups.ts /tmp/fixups.ts
