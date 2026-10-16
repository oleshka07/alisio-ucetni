import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { ingestDocument } from "@/lib/docs/ingest";
import { isBankStatementFile } from "@/lib/bank/detect";
import { importStatementFiles } from "@/lib/bank/sync";

export const maxDuration = 60;

/** Завантажити документи без вибору платежу — система сама знайде платіж. */
export const POST = handle(async (req: NextRequest) => {
  const session = await requireStaff();
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const clientId = (form.get("clientId") as string) || null;
  const out = [];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new HttpError(400, `${file.name}: max 20 MB`);
    const buffer = Buffer.from(await file.arrayBuffer());
    // bankovní výpis nahraný mezi doklady → do výpisů (k účtu podle čísla)
    if (await isBankStatementFile(buffer, file.name)) {
      const [st] = await importStatementFiles([{ name: file.name, content: buffer }]);
      out.push({ name: file.name, statement: true, ok: st.ok, account: st.account, imported: st.imported, error: st.error });
      continue;
    }
    const r = await ingestDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      source: session.role === "accountant" ? "accountant" : "web",
      uploadedBy: session.role,
      clientId,
    });
    out.push({
      documentId: r.document.id,
      name: file.name,
      duplicate: r.duplicate,
      linkedTo: r.linkedTo.map((t) => t.id),
      autoLinked: !!r.autoLinked,
      candidates: r.candidates.length,
    });
  }
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  revalidatePath("/statements");
  return NextResponse.json({ ok: true, results: out });
});
