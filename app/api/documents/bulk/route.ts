import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { updateDocument, deleteArchivedDocument } from "@/lib/docs/doc-actions";

const ACTIONS = ["archive", "unarchive", "delete", "docType", "clientId"] as const;

/** Масові дії над документами з «Nepřiřazené doklady». */
export const POST = handle(async (req: NextRequest) => {
  const session = await requireStaff();
  const { ids, action, value } = await req.json();
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new HttpError(400, "Vyberte 1–200 dokladů");
  if (!ACTIONS.includes(action)) throw new HttpError(400, "Neznámá akce");
  if (action === "delete" && session.role !== "owner") throw new HttpError(403, "Mazat může jen majitel");

  let done = 0;
  let autoLinked = 0;
  const errors: string[] = [];
  for (const id of ids.map(String)) {
    try {
      if (action === "delete") await deleteArchivedDocument(id);
      else {
        const body =
          action === "archive" ? { archived: true } : action === "unarchive" ? { archived: false } : { [action]: value ?? null };
        const r = await updateDocument(id, body);
        if (r.autoLinked) autoLinked++;
      }
      done++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  return NextResponse.json({ ok: true, done, autoLinked, errors: [...new Set(errors)] });
});
