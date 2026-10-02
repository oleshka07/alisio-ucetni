import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { handle, HttpError } from "@/lib/guard";
import { putFile, extFromName } from "@/lib/storage";
import { sha256Hex } from "@/lib/crypto";
import { COMPANY_DOC_CATEGORIES } from "@/lib/docs/company-docs";

const MAX = 25 * 1024 * 1024;

/**
 * Firemní dokumenty (výpis z OR, stanovy, licence, smlouvy…): bez AI rozpoznávání a párování s platbami.
 * Staff nahrává pro libovolnou firmu, klient portálu jen pro svou.
 */
export const POST = handle(async (req: NextRequest) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Unauthorized");
  const form = await req.formData();
  const clientId = session.role === "client" ? session.clientId : String(form.get("clientId") || "");
  if (!clientId) throw new HttpError(400, "Vyberte firmu");
  if (session.role === "client" && form.get("clientId") && form.get("clientId") !== session.clientId) throw new HttpError(403, "Access denied");
  if (!(await prisma.client.findUnique({ where: { id: clientId } }))) throw new HttpError(404, "Firma nenalezena");

  const category = String(form.get("docCategory") || "other");
  if (!(category in COMPANY_DOC_CATEGORIES)) throw new HttpError(400, "Neznámá kategorie");
  const validUntilRaw = String(form.get("validUntil") || "");
  if (validUntilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(validUntilRaw)) throw new HttpError(400, "Neplatné datum");
  const description = String(form.get("description") || "").slice(0, 500) || null;
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new HttpError(400, "Chybí soubor");

  const results = [];
  for (const file of files) {
    if (file.size > MAX) throw new HttpError(400, `${file.name}: soubor je větší než 25 MB`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `company-docs/${clientId}/${crypto.randomUUID()}${extFromName(file.name)}`;
    const fileUrl = await putFile(key, buffer, file.type);
    const doc = await prisma.document.create({
      data: {
        clientId,
        filename: key,
        originalName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl,
        uploadedBy: session.role,
        source: session.role === "client" ? "web" : "accountant",
        sha256: sha256Hex(buffer),
        aiStatus: "skipped",
        companyDoc: true,
        docCategory: category,
        validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
        description,
      },
    });
    results.push({ name: doc.originalName });
  }
  revalidatePath("/documents");
  revalidatePath("/portal/documents");
  return NextResponse.json({ results });
});
