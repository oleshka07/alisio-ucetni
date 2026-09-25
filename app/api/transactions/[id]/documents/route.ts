import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { ingestDocument, unlinkDocument } from "@/lib/docs/ingest";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Завантажити документ прямо до платежу (один або кілька файлів). */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireStaff();
  const { id } = await params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) throw new HttpError(404, "Platba nenalezena");
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const docType = (form.get("docType") as string) || null;

  const results = [];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new HttpError(400, `${file.name}: max 20 MB`);
    const r = await ingestDocument({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      source: session.role === "accountant" ? "accountant" : "web",
      uploadedBy: session.role,
      transactionId: id,
      docType,
    });
    results.push({ documentId: r.document.id, duplicate: r.duplicate });
  }
  revalidatePath(`/transactions/${id}`);
  revalidatePath("/transactions");
  return NextResponse.json({ ok: true, results });
});

export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff();
  const { id } = await params;
  const documentId = new URL(req.url).searchParams.get("documentId");
  if (!documentId) throw new HttpError(400, "Chybí documentId");
  await unlinkDocument(id, documentId);
  revalidatePath(`/transactions/${id}`);
  return NextResponse.json({ ok: true });
});
