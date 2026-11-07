import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { isBankStatementFile } from "@/lib/bank/detect";
import { importStatementFiles, type FileImportResult } from "@/lib/bank/sync";
import { aiEnabled } from "./extract";
import { findCandidates, pickAutoMatch } from "./match";
import { ingestDocument, linkDocument, reprocessDocument, type IngestInput, type IngestResult } from "./ingest";

/**
 * Jeden vstup pro všechno, co přijde (Telegram, web, MCP): výpis → k účtu a firmě podle čísla účtu ve výpisu,
 * ostatní → doklad (AI pozná druh, firmu podle IČO, přiřadí k platbě; plné moci, výpisy z rejstříku,
 * rozhodnutí úřadů → dokumenty firmy).
 */
export type Routed = { kind: "statement"; result: FileImportResult } | { kind: "document"; result: IngestResult };

export async function routeIncomingFile(input: IngestInput): Promise<Routed> {
  if (!input.transactionId && (await isBankStatementFile(input.buffer, input.fileName))) {
    const [result] = await importStatementFiles([{ name: input.fileName, content: input.buffer }]);
    return { kind: "statement", result };
  }
  return { kind: "document", result: await ingestDocument(input) };
}

export type ResortReport = {
  checked: number;
  statements: number; // přesunuto do výpisů
  transactions: number; // nových plateb z těch výpisů
  recognized: number; // znovu rozpoznáno AI
  companyDocs: number; // přesunuto do dokumentů firmy
  linked: number; // přiřazeno k platbě
  notes: string[];
};

/** Výpis, který ležel mezi doklady, se načte do výpisů a doklad se archivuje (soubor zůstane ve výpisech). */
export async function moveDocumentToStatements(docId: string): Promise<FileImportResult> {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
  const [r] = await importStatementFiles([{ name: doc.originalName, content: await readFile(doc.fileUrl) }]);
  if (r.ok) {
    await prisma.transactionDocument.deleteMany({ where: { documentId: doc.id } });
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        docType: "bank_statement",
        archivedAt: new Date(),
        description: `Přesunuto do výpisů${r.account ? ` (${r.account})` : ""}: nových plateb ${r.imported}${r.duplicate ? ", výpis už byl nahrán" : ""}.`,
      },
    });
  }
  return r;
}

/**
 * „Rozřadit“ nepřiřazené doklady: výpisy → výpisy, nerozpoznané → znovu AI (druh, firma, platba),
 * rozpoznané → zkusit přiřadit k platbě. Volá se tlačítkem v „Nepřiřazené doklady“ a 1× denně z cronu.
 */
export async function resortUnassigned(limit = 40): Promise<ResortReport> {
  const rep: ResortReport = { checked: 0, statements: 0, transactions: 0, recognized: 0, companyDocs: 0, linked: 0, notes: [] };
  const docs = await prisma.document.findMany({
    where: { links: { none: {} }, task: null, archivedAt: null, companyDoc: false },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const doc of docs) {
    rep.checked++;
    try {
      const buffer = await readFile(doc.fileUrl);
      if (await isBankStatementFile(buffer, doc.originalName)) {
        const r = await moveDocumentToStatements(doc.id);
        if (r.ok) {
          rep.statements++;
          rep.transactions += r.imported;
        } else rep.notes.push(`${doc.originalName}: ${r.error}`);
        continue;
      }
      // nerozpoznané, bez firmy, nebo z doby před novými druhy dokumentů (druh „jiný“) — jednou znovu přes AI
      if (aiEnabled() && !doc.resortedAt && (doc.aiStatus !== "done" || !doc.clientId || !doc.docType || doc.docType === "other")) {
        await prisma.document.update({ where: { id: doc.id }, data: { resortedAt: new Date() } });
        const r = await reprocessDocument(doc.id);
        rep.recognized++;
        if (r.document.companyDoc) rep.companyDocs++;
        if (r.autoLinked) rep.linked++;
        if (r.document.docType === "bank_statement") rep.notes.push(`${doc.originalName}: vypadá jako výpis, ale tento formát zatím neumíme načíst`);
        continue;
      }
      const auto = pickAutoMatch(await findCandidates(doc));
      if (auto) {
        await linkDocument(auto.tx.id, doc.id, "auto");
        rep.linked++;
      }
    } catch (e) {
      rep.notes.push(`${doc.originalName}: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
  }
  return rep;
}
