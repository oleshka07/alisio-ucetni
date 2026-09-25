import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { readFile } from "@/lib/storage";
import { monthRange } from "@/lib/format";
import { CATEGORIES, DOC_STATUS, docTypeLabel } from "@/lib/docs/types";

export const maxDuration = 60;

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** ZIP за місяць для бухгалтера: platby.csv + усі документи, розкладені по платежах. */
export const GET = handle(async (req: NextRequest) => {
  await requireStaff();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const month = url.searchParams.get("month") || "";
  if (!clientId || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "clientId a month (YYYY-MM) jsou povinné");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new HttpError(404, "Firma nenalezena");
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
      } catch {
        names.push(`${l.document.originalName} (soubor nedostupný)`);
      }
    }
    rows.push(
      [
        tx.bookingDate.toISOString().slice(0, 10),
        tx.bankAccount?.name || "",
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
  const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const fname = `${client.name.replace(/[^\w\-]+/g, "_")}_${month}.zip`;
  return new NextResponse(buf as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${fname}"` },
  });
});
