import OpenAI from "openai";
import { extractFileText } from "@/lib/ai/file-parser";

/**
 * AI-розпізнавання документа: тип, номер, дата, сума, VS, IČO сторін.
 * PDF і фото надсилаються моделі напряму (працює і для сканів), таблиці/текст — як текст.
 */

export interface Extracted {
  docType: "invoice" | "receipt" | "contract" | "cmr" | "customs" | "payslip" | "credit_note" | "other";
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  totalAmount: number | null; // до сплати, з ПДВ
  currency: string | null;
  vatAmount: number | null;
  variableSymbol: string | null;
  supplierName: string | null;
  supplierIco: string | null;
  supplierDic: string | null;
  customerName: string | null;
  customerIco: string | null;
  reverseCharge: boolean;
  summary: string; // одне речення українською
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "docType", "documentNumber", "issueDate", "dueDate", "totalAmount", "currency", "vatAmount",
    "variableSymbol", "supplierName", "supplierIco", "supplierDic", "customerName", "customerIco",
    "reverseCharge", "summary",
  ],
  properties: {
    docType: { type: "string", enum: ["invoice", "receipt", "contract", "cmr", "customs", "payslip", "credit_note", "other"] },
    documentNumber: { type: ["string", "null"] },
    issueDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
    dueDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
    totalAmount: { type: ["number", "null"], description: "Total to pay incl. VAT, positive number" },
    currency: { type: ["string", "null"], description: "ISO code, e.g. CZK, EUR" },
    vatAmount: { type: ["number", "null"] },
    variableSymbol: { type: ["string", "null"], description: "Czech 'variabilní symbol', digits only" },
    supplierName: { type: ["string", "null"] },
    supplierIco: { type: ["string", "null"], description: "IČO, digits only" },
    supplierDic: { type: ["string", "null"] },
    customerName: { type: ["string", "null"] },
    customerIco: { type: ["string", "null"], description: "IČO, digits only" },
    reverseCharge: { type: "boolean", description: "true if 'reverse charge' / 'přenesená daňová povinnost' is stated" },
    summary: { type: "string", description: "One short sentence in Ukrainian: what is this document" },
  },
} as const;

const SYSTEM = `You extract data from Czech/EU business documents (faktury, účtenky, smlouvy, CMR, celní prohlášení).
Return ONLY facts that are visible in the document. If a field is not present, return null. Never guess amounts.
Dates → YYYY-MM-DD. Amounts → numbers without currency symbols. IČO → 8 digits.`;

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function aiEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function extractDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<Extracted | null> {
  const openai = getClient();
  if (!openai) return null;

  const b64 = buffer.toString("base64");
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
  const isImage = mimeType.startsWith("image/");

  type Part =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "file"; file: { filename: string; file_data: string } };
  const parts: Part[] = [{ type: "text", text: `File name: ${fileName}` }];

  if (isPdf) {
    parts.push({ type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${b64}` } });
  } else if (isImage) {
    parts.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } });
  } else {
    const text = await extractFileText(b64, fileName, mimeType);
    if (!text) return null;
    parts.push({ type: "text", text: text.slice(0, 30_000) });
  }

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: parts as never },
    ],
    response_format: { type: "json_schema", json_schema: { name: "document", schema: SCHEMA as never, strict: true } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content) as Extracted;
}

export function onlyDigits(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}
