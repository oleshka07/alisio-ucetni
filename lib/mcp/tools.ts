import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { ingestDocument, linkDocument } from "@/lib/docs/ingest";
import { importStatementFiles } from "@/lib/bank/sync";
import { isBankStatementFile } from "@/lib/bank/detect";
import { searchMail } from "@/lib/mail/imap";
import { reapplyRules } from "@/lib/docs/rules";

/**
 * Nástroje MCP konektoru: AI (Claude) pracuje s evidencí jménem uživatele tokenu.
 * Výstup je JSON v textu — AI ho přečte, člověk ho nevidí.
 */

type Args = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (args: Args, user: User) => Promise<unknown>;
}

export class ToolError extends Error {}

const str = (a: Args, k: string) => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string).trim() : undefined);
const num = (a: Args, k: string, def: number, max: number) => Math.min(Math.max(Number(a[k]) || def, 1), max);
const day = (a: Args, k: string) => {
  const v = str(a, k);
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ToolError(`${k}: očekávám datum RRRR-MM-DD`);
  return new Date(`${v}T00:00:00Z`);
};
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const MAX_FILE = 15 * 1024 * 1024;

function decodeFile(a: Args): { name: string; buffer: Buffer } {
  const name = str(a, "fileName");
  const b64 = str(a, "contentBase64");
  if (!name || !b64) throw new ToolError("Chybí fileName nebo contentBase64");
  const buffer = Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");
  if (!buffer.length) throw new ToolError("Prázdný soubor (contentBase64 není base64?)");
  if (buffer.length > MAX_FILE) throw new ToolError("Soubor je větší než 15 MB");
  return { name: name.replace(/[\\/]/g, "_").slice(0, 200), buffer };
}

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  return (
    { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", xml: "application/xml", isdoc: "application/xml", csv: "text/csv" } as Record<string, string>
  )[ext || ""] || "application/octet-stream";
}

const txOut = (t: {
  id: string; bookingDate: Date; amount: unknown; currency: string; counterpartyName: string | null; counterpartyAccount: string | null;
  variableSymbol: string | null; message: string | null; docStatus: string; requiredDocs: string[]; docHint: string | null; category: string | null;
  client?: { name: string } | null; bankAccount?: { name: string } | null;
}) => ({
  id: t.id,
  date: ymd(t.bookingDate),
  amount: Number(t.amount),
  currency: t.currency,
  firm: t.client?.name,
  account: t.bankAccount?.name,
  counterparty: t.counterpartyName,
  counterpartyAccount: t.counterpartyAccount,
  vs: t.variableSymbol,
  message: t.message,
  category: t.category,
  docStatus: t.docStatus,
  requiredDocs: t.requiredDocs,
  hint: t.docHint,
});

async function ingestFile(user: User, name: string, buffer: Buffer, a: Args, description?: string | null) {
  const r = await ingestDocument({
    buffer,
    fileName: name,
    mimeType: mimeOf(name),
    source: "accountant",
    uploadedBy: `mcp:${user.role}`,
    clientId: str(a, "clientId") ?? null,
    transactionId: str(a, "transactionId") ?? null,
    docType: str(a, "docType") ?? null,
    description: description ?? str(a, "description") ?? null,
    linkedBy: `mcp:${user.email}`,
  });
  return {
    documentId: r.document.id,
    fileName: name,
    duplicate: r.duplicate,
    recognized: {
      docType: r.document.docType,
      amount: r.document.extractedAmount != null ? Number(r.document.extractedAmount) : null,
      currency: r.document.extractedCurrency,
      date: ymd(r.document.extractedDate),
      counterparty: r.document.extractedCounterparty,
      vs: r.document.extractedVs,
    },
    linkedTo: r.linkedTo.map((t) => ({ id: t.id, date: ymd(t.bookingDate), amount: Number(t.amount), counterparty: t.counterpartyName })),
    autoLinked: !!r.autoLinked,
    candidates: r.candidates.slice(0, 5).map((c) => ({ transactionId: c.tx.id, date: ymd(c.tx.bookingDate), amount: Number(c.tx.amount), counterparty: c.tx.counterpartyName, score: c.score })),
  };
}

export const TOOLS: Tool[] = [
  {
    name: "list_clients",
    description: "Firmy v evidenci (id, název, IČO, DIČ, bankovní účty). ID firmy se předává ostatním nástrojům.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const clients = await prisma.client.findMany({
        where: { isActive: true },
        include: { companyProfile: true, bankAccounts: { where: { isActive: true } } },
        orderBy: { createdAt: "asc" },
      });
      return clients.map((c) => ({
        id: c.id, name: c.name, type: c.type, ico: c.companyProfile?.ico ?? null, dic: c.companyProfile?.dic ?? null,
        accounts: c.bankAccounts.map((b) => ({ id: b.id, name: b.name, currency: b.currency, number: b.accountNumber || b.iban })),
      }));
    },
  },
  {
    name: "list_missing_documents",
    description:
      "Platby, ke kterým chybí doklad (faktura, účtenka…). Pro každou: datum, částka, protistrana, VS, zpráva, jaký doklad je potřeba. " +
      "Použij k hledání faktur v poště a jejich nahrání (import_email_attachments / upload_document s transactionId).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Jen tato firma" },
        from: { type: "string", description: "Od data RRRR-MM-DD" },
        to: { type: "string", description: "Do data RRRR-MM-DD" },
        limit: { type: "number", description: "Max. počet (výchozí 50, max 200)" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const from = day(a, "from");
      const to = day(a, "to");
      const rows = await prisma.transaction.findMany({
        where: {
          docStatus: { in: ["missing", "partial"] },
          clientId: str(a, "clientId"),
          bookingDate: from || to ? { gte: from, lte: to } : undefined,
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
        },
        include: { client: true, bankAccount: true },
        orderBy: { bookingDate: "desc" },
        take: num(a, "limit", 50, 200),
      });
      return { count: rows.length, transactions: rows.map(txOut) };
    },
  },
  {
    name: "search_transactions",
    description: "Hledání plateb podle textu (protistrana, zpráva, VS), částky a období.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text v protistraně / zprávě / VS" },
        amount: { type: "number", description: "Přesná částka (absolutní hodnota, ±0,01)" },
        clientId: { type: "string" },
        from: { type: "string", description: "RRRR-MM-DD" },
        to: { type: "string", description: "RRRR-MM-DD" },
        limit: { type: "number", description: "Výchozí 30, max 200" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const q = str(a, "query");
      const amount = typeof a.amount === "number" ? Math.abs(a.amount) : undefined;
      const from = day(a, "from");
      const to = day(a, "to");
      const rows = await prisma.transaction.findMany({
        where: {
          clientId: str(a, "clientId"),
          bookingDate: from || to ? { gte: from, lte: to } : undefined,
          AND: [
            q ? { OR: [{ counterpartyName: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { variableSymbol: { contains: q } }] } : {},
            amount != null ? { OR: [{ amount: { gte: amount - 0.01, lte: amount + 0.01 } }, { amount: { gte: -amount - 0.01, lte: -amount + 0.01 } }] } : {},
          ],
        },
        include: { client: true, bankAccount: true },
        orderBy: { bookingDate: "desc" },
        take: num(a, "limit", 30, 200),
      });
      return rows.map(txOut);
    },
  },
  {
    name: "list_unassigned_documents",
    description: "Nahrané doklady, které zatím nejsou přiřazené k žádné platbě (bez archivovaných a dokumentů firmy).",
    inputSchema: { type: "object", properties: { clientId: { type: "string" }, limit: { type: "number", description: "Výchozí 30, max 200" } } },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const docs = await prisma.document.findMany({
        where: { links: { none: {} }, archivedAt: null, companyDoc: false, clientId: str(a, "clientId") },
        orderBy: { createdAt: "desc" },
        take: num(a, "limit", 30, 200),
      });
      return docs.map((d) => ({
        id: d.id, fileName: d.originalName, uploaded: ymd(d.createdAt), docType: d.docType,
        amount: d.extractedAmount != null ? Number(d.extractedAmount) : null, currency: d.extractedCurrency,
        date: ymd(d.extractedDate), counterparty: d.extractedCounterparty, vs: d.extractedVs, clientId: d.clientId,
      }));
    },
  },
  {
    name: "upload_document",
    description:
      "Nahraje doklad (PDF / obrázek / ISDOC) v base64. Systém ho rozpozná (AI) a sám přiřadí k platbě; s transactionId ho přiřadí přímo. " +
      "Stejný soubor podruhé nevznikne. Vrací rozpoznané údaje a kandidátní platby.",
    inputSchema: {
      type: "object",
      required: ["fileName", "contentBase64"],
      properties: {
        fileName: { type: "string", description: "Název souboru s příponou, např. faktura-2026-117.pdf" },
        contentBase64: { type: "string", description: "Obsah souboru v base64 (max 15 MB)" },
        transactionId: { type: "string", description: "Přiřadit k této platbě" },
        clientId: { type: "string", description: "Firma, pokud není zřejmá" },
        docType: { type: "string", enum: ["invoice_in", "invoice_out", "receipt", "contract", "cmr", "customs", "payslip", "other"] },
        description: { type: "string" },
      },
    },
    run: async (a, user) => {
      const { name, buffer } = decodeFile(a);
      if (await isBankStatementFile(buffer, name)) throw new ToolError("Tohle je bankovní výpis — použij upload_statement");
      return ingestFile(user, name, buffer, a);
    },
  },
  {
    name: "link_document",
    description: "Přiřadí už nahraný doklad k platbě.",
    inputSchema: { type: "object", required: ["documentId", "transactionId"], properties: { documentId: { type: "string" }, transactionId: { type: "string" } } },
    annotations: { idempotentHint: true },
    run: async (a, user) => {
      const documentId = str(a, "documentId");
      const transactionId = str(a, "transactionId");
      if (!documentId || !transactionId) throw new ToolError("Chybí documentId nebo transactionId");
      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      if (!doc) throw new ToolError("Doklad nenalezen");
      await linkDocument(transactionId, documentId, `mcp:${user.email}`);
      const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { docStatus: true } });
      return { ok: true, transactionId, docStatus: tx?.docStatus };
    },
  },
  {
    name: "upload_statement",
    description:
      "Nahraje bankovní výpis v base64: PDF Komerční banky (výpis i přehled plateb), CSV z MojeBanky, PDF České spořitelny, CAMT.053 XML. " +
      "Účet a firma se poznají z výpisu, duplicity se přeskočí.",
    inputSchema: {
      type: "object",
      required: ["fileName", "contentBase64"],
      properties: { fileName: { type: "string" }, contentBase64: { type: "string", description: "Obsah souboru v base64 (max 15 MB)" } },
    },
    run: async (a) => {
      const { name, buffer } = decodeFile(a);
      const [r] = await importStatementFiles([{ name, content: buffer }]);
      return r;
    },
  },
  {
    name: "import_email_attachments",
    description:
      "Najde e-maily ve schránce napojené v evidenci (Nastavení → Schránky s doklady) a nahraje z nich přílohy PDF/ISDOC jako doklady — " +
      "včetně starších listů, které automatická synchronizace nevzala. U Gmailu lze hledat Gmail syntaxí (gmailQuery), jinak from/subject/since/before. " +
      "dryRun: jen ukáže nalezené listy a přílohy. S transactionId se doklad přiřadí přímo k platbě.",
    inputSchema: {
      type: "object",
      properties: {
        gmailQuery: { type: "string", description: "Např. „from:booking.com has:attachment after:2026/07/01“" },
        from: { type: "string" },
        subject: { type: "string" },
        since: { type: "string", description: "RRRR-MM-DD" },
        before: { type: "string", description: "RRRR-MM-DD" },
        inboxId: { type: "string", description: "Jen tato schránka (výchozí: všechny aktivní, kromě „jen datová schránka“)" },
        limit: { type: "number", description: "Max. listů (výchozí 5, max 20)" },
        transactionId: { type: "string" },
        clientId: { type: "string" },
        dryRun: { type: "boolean" },
      },
    },
    run: async (a, user) => {
      const inboxes = await prisma.documentInbox.findMany({
        where: { isActive: true, kind: { not: "databox" }, id: str(a, "inboxId") },
        orderBy: { createdAt: "asc" },
      });
      if (!inboxes.length) throw new ToolError("V evidenci není napojená žádná schránka s doklady (Nastavení → Schránky)");
      const query = { gmailQuery: str(a, "gmailQuery"), from: str(a, "from"), subject: str(a, "subject"), since: day(a, "since"), before: day(a, "before") };
      const limit = num(a, "limit", 5, 20);
      const out: unknown[] = [];
      for (const inbox of inboxes) {
        const mails = await searchMail(
          { host: inbox.imapHost, port: inbox.imapPort, user: inbox.imapUser, password: decryptSecret(inbox.imapPasswordEnc), folder: inbox.imapFolder },
          query,
          limit
        );
        for (const m of mails) {
          const atts = m.attachments.filter((x) => /pdf|xml|isdoc|image\//i.test(x.contentType || "") || /\.(pdf|isdocx?|xml|jpe?g|png)$/i.test(x.filename || ""));
          const entry: Record<string, unknown> = { inbox: inbox.name, date: m.date?.toISOString() ?? null, from: m.from, subject: m.subject, attachments: atts.map((x) => x.filename) };
          if (!a.dryRun) {
            const docs: unknown[] = [];
            for (const att of atts) {
              const name = att.filename || "priloha.pdf";
              if (await isBankStatementFile(att.content, name)) {
                docs.push({ fileName: name, statement: await importStatementFiles([{ name, content: att.content }]).then((r) => r[0]) });
                continue;
              }
              docs.push(await ingestFile(user, name, att.content, { ...a, clientId: str(a, "clientId") ?? inbox.clientId ?? undefined }, m.subject ? `E-mail: ${m.subject}`.slice(0, 200) : null));
            }
            entry.documents = docs;
          }
          out.push(entry);
        }
      }
      return { found: out.length, mails: out };
    },
  },
  {
    name: "reapply_rules",
    description: "Znovu použije pravidla „jaký doklad je potřeba“ na všechny platby (kromě ručně nastavených) — po změně pravidel.",
    inputSchema: { type: "object", properties: {} },
    annotations: { idempotentHint: true },
    run: async (_a, user) => {
      if (user.role !== "owner") throw new ToolError("Jen majitel");
      return reapplyRules();
    },
  },
  {
    name: "list_tasks",
    description: "Úkoly v evidenci (lze filtrovat stavem, textem — např. „#ідеї“ — a firmou).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "done", "cancelled", "open"], description: "open = pending + in_progress" },
        search: { type: "string" },
        clientId: { type: "string" },
        limit: { type: "number", description: "Výchozí 50, max 200" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const status = str(a, "status");
      const q = str(a, "search");
      const tasks = await prisma.task.findMany({
        where: {
          clientId: str(a, "clientId"),
          status: status === "open" ? { in: ["pending", "in_progress"] } : status,
          OR: q ? [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] : undefined,
        },
        include: { client: true },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: num(a, "limit", 50, 200),
      });
      return tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, due: ymd(t.dueDate), firm: t.client.name, notes: t.notes }));
    },
  },
  {
    name: "create_task",
    description: "Založí úkol (např. nápad do plánu s „#ідеї“ v názvu). Bez clientId patří první firmě majitele.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        clientId: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        dueDate: { type: "string", description: "RRRR-MM-DD" },
      },
    },
    run: async (a) => {
      const title = str(a, "title");
      if (!title) throw new ToolError("Chybí title");
      const clientId = str(a, "clientId") ?? (await prisma.client.findFirst({ where: { isActive: true, role: "owner" }, orderBy: { createdAt: "asc" } }))?.id;
      if (!clientId) throw new ToolError("Zadejte clientId");
      const t = await prisma.task.create({
        data: {
          clientId, title: title.slice(0, 200), description: str(a, "description") ?? null,
          priority: ["low", "normal", "high"].includes(String(a.priority)) ? String(a.priority) : "normal",
          dueDate: day(a, "dueDate") ?? null, createdBy: "accountant", source: "manual",
        },
      });
      return { id: t.id, title: t.title };
    },
  },
  {
    name: "update_task",
    description: "Změní úkol: stav, název, popis, poznámku.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "in_progress", "done", "cancelled"] },
        title: { type: "string" },
        description: { type: "string" },
        notes: { type: "string" },
      },
    },
    annotations: { idempotentHint: true },
    run: async (a) => {
      const id = str(a, "id");
      if (!id) throw new ToolError("Chybí id");
      const data: Record<string, string> = {};
      for (const k of ["title", "description", "notes"]) if (typeof a[k] === "string") data[k] = a[k] as string;
      if (a.status && ["pending", "in_progress", "done", "cancelled"].includes(String(a.status))) data.status = String(a.status);
      const t = await prisma.task.update({ where: { id }, data }).catch(() => null);
      if (!t) throw new ToolError("Úkol nenalezen");
      return { id: t.id, status: t.status, title: t.title };
    },
  },
];
