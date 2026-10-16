import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { importStatementFiles, type FileImportResult } from "@/lib/bank/sync";
import { isBankStatementFile } from "@/lib/bank/detect";
import { ingestDocument } from "@/lib/docs/ingest";

export const maxDuration = 120;

/**
 * Ruční nahrání výpisů — účet a firma se poznají z výpisu.
 * Soubor, který výpisem není (faktura, účtenka…), se nezahodí: uloží se jako doklad a systém ho zkusí přiřadit k platbě.
 */
export const POST = handle(async (req: NextRequest) => {
  const session = await requireStaff();
  const files = (await req.formData()).getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const all = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, content: Buffer.from(await f.arrayBuffer()) })));

  const statements: typeof all = [];
  const documents: typeof all = [];
  for (const f of all) ((await isBankStatementFile(f.content, f.name)) ? statements : documents).push(f);

  const results: Array<FileImportResult & { asDocument?: boolean; autoLinked?: boolean }> = statements.length ? await importStatementFiles(statements) : [];
  for (const f of documents) {
    try {
      const r = await ingestDocument({
        buffer: f.content,
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        source: session.role === "accountant" ? "accountant" : "web",
        uploadedBy: session.role,
      });
      results.push({ fileName: f.name, ok: true, imported: 0, total: 0, asDocument: true, autoLinked: !!r.autoLinked, duplicate: r.duplicate });
    } catch (e) {
      results.push({ fileName: f.name, ok: false, imported: 0, total: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const errors = results.filter((r) => !r.ok).map((r) => `${r.fileName}: ${r.error}`);
  if (errors.length === results.length) throw new HttpError(400, errors.join("\n"));
  revalidatePath("/statements");
  revalidatePath("/transactions");
  revalidatePath("/inbox");
  return NextResponse.json({
    imported: results.reduce((s, r) => s + r.imported, 0),
    total: results.reduce((s, r) => s + r.total, 0),
    errors,
    results,
  });
});
