import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { monthRange } from "@/lib/format";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { CATEGORIES, DOC_STATUS, docTypeLabel } from "@/lib/docs/types";
import { methodLabel } from "@/lib/docs/manual-payment";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type MissingRow = { date: Date; amount: number; currency: string; counterparty: string | null };
export type MonthExport = {
  buf: Uint8Array;
  fileName: string;
  clientName: string;
  payments: number;
  documents: number;
  statements: number;
  unpaidDocs: number;
  missing: MissingRow[];
};

/**
 * ZIP za měsíc pro účetní: platby.csv + doklady po platbách + originály výpisů
 * + doklady s datem v měsíci, které zatím nemají platbu (zaplaceno jinak / ještě nezaplaceno).
 */
export async function buildMonthZip(clientId: string, month: string): Promise<MonthExport> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const { from, to } = monthRange(month);

  const txs = await prisma.transaction.findMany({
    where: { clientId, bookingDate: { gte: from, lt: to } },
    orderBy: { bookingDate: "asc" },
    include: { links: { include: { document: true } }, bankAccount: true },
  });

  const zip = new JSZip();
  const rows = [
    ["Datum", "Účet", "Částka", "Měna", "Protistrana", "Protiúčet", "VS", "Zpráva", "Kategorie", "Stav dokladů", "Doklady"].join(";"),
  ];
  let n = 0;
  let documents = 0;
  const missing: MissingRow[] = [];
  for (const tx of txs) {
    n++;
    const prefix = `${String(n).padStart(3, "0")}_${tx.bookingDate.toISOString().slice(0, 10)}_${Number(tx.amount).toFixed(0)}`;
    const names: string[] = [];
    for (const l of tx.links) {
      const safe = l.document.originalName.replace(/[^\w.\-]+/g, "_").slice(-80);
      const name = `doklady/${prefix}_${safe}`;
      try {
        zip.file(name, await readFile(l.document.fileUrl));
        names.push(`${docTypeLabel(l.document.docType)}: ${name}`);
        documents++;
      } catch {
        names.push(`${l.document.originalName} (soubor nedostupný)`);
      }
    }
    if (tx.docStatus === "missing" || tx.docStatus === "partial") {
      missing.push({ date: tx.bookingDate, amount: Number(tx.amount), currency: tx.currency, counterparty: tx.counterpartyName || tx.message });
    }
    rows.push(
      [
        tx.bookingDate.toISOString().slice(0, 10),
        tx.paymentMethod ? `${methodLabel(tx.paymentMethod)} (mimo banku)` : tx.bankAccount?.name || "",
        Number(tx.amount).toFixed(2).replace(".", ","),
        tx.currency,
        tx.counterpartyName,
        tx.counterpartyAccount,
        tx.variableSymbol,
        tx.message,
        CATEGORIES[tx.category || ""] || tx.category,
        DOC_STATUS[tx.docStatus]?.cs || tx.docStatus,
        names.join(" | "),
      ].map(csvCell).join(";")
    );
  }
  zip.file("platby.csv", "﻿" + rows.join("\r\n"));

  // originály výpisů, jejichž období zasahuje do měsíce
  const statementRows = await prisma.bankStatement.findMany({
    where: {
      bankAccount: { clientId },
      fileUrl: { not: null },
      OR: [{ periodFrom: { lt: to }, periodTo: { gte: from } }, { periodFrom: null, createdAt: { gte: from, lt: to } }],
    },
    include: { bankAccount: { select: { name: true } } },
    orderBy: { periodFrom: "asc" },
  });
  const seenFiles = new Set<string>();
  for (const st of statementRows) {
    if (!st.fileUrl || seenFiles.has(st.fileUrl)) continue;
    seenFiles.add(st.fileUrl);
    const safe = `${st.bankAccount.name}_${st.fileName || st.id}`.replace(/[^\w.\-]+/g, "_").slice(-100);
    try {
      zip.file(`vypisy/${safe}`, await readFile(st.fileUrl));
    } catch {
      seenFiles.delete(st.fileUrl); // soubor nedostupný — CSV i doklady i tak stačí
    }
  }

  // faktury / účtenky s datem v měsíci, které zatím nemají platbu
  const unpaid = await prisma.document.findMany({
    where: { clientId, links: { none: {} }, archivedAt: null, companyDoc: false, extractedDate: { gte: from, lt: to } },
    orderBy: { extractedDate: "asc" },
  });
  let unpaidDocs = 0;
  for (const d of unpaid) {
    const safe = `${d.extractedDate?.toISOString().slice(0, 10) ?? ""}_${d.originalName}`.replace(/[^\w.\-]+/g, "_").slice(-100);
    try {
      zip.file(`doklady-bez-platby/${safe}`, await readFile(d.fileUrl));
      unpaidDocs++;
    } catch {
      // soubor nedostupný
    }
  }

  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    buf,
    fileName: `${client.name.replace(/[^\w\-]+/g, "_")}_${month}.zip`,
    clientName: client.name,
    payments: txs.length,
    documents,
    statements: seenFiles.size,
    unpaidDocs,
    missing,
  };
}

// ─── Odkaz ke stažení bez přihlášení (do e-mailu účetní) ─────────────────────

const LINK_DAYS = 30;
function linkSecret(): string {
  const s = process.env.EXPORT_LINK_SECRET || process.env.CRON_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("Chybí EXPORT_LINK_SECRET / CRON_SECRET");
  return s;
}

export function signExportLink(clientId: string, month: string, now = Date.now()): { exp: number; sig: string } {
  const exp = Math.floor(now / 1000) + LINK_DAYS * 86400;
  return { exp, sig: hmacHex(linkSecret(), `month-export|${clientId}|${month}|${exp}`) };
}

export function verifyExportLink(clientId: string, month: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(sig, hmacHex(linkSecret(), `month-export|${clientId}|${month}|${exp}`));
}
