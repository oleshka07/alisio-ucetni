import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { importStatementFiles } from "@/lib/bank/sync";

export const maxDuration = 120;

/** Ручне завантаження виписок (CAMT.053 XML / PDF KB) — рахунок визначається з виписки. */
export const POST = handle(async (req: NextRequest) => {
  await requireStaff();
  const files = (await req.formData()).getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const results = await importStatementFiles(
    await Promise.all(files.map(async (f) => ({ name: f.name, content: Buffer.from(await f.arrayBuffer()) })))
  );
  const errors = results.filter((r) => !r.ok).map((r) => `${r.fileName}: ${r.error}`);
  if (errors.length === results.length) throw new HttpError(400, errors.join("\n"));
  revalidatePath("/statements");
  revalidatePath("/transactions");
  return NextResponse.json({
    imported: results.reduce((s, r) => s + r.imported, 0),
    total: results.reduce((s, r) => s + r.total, 0),
    errors,
    results,
  });
});
