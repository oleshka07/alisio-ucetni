import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff } from "@/lib/guard";
import { updateDocument, deleteArchivedDocument } from "@/lib/docs/doc-actions";

/** Змінити тип, фірму, виправити розпізнані дані, архівувати. */
export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const { autoLinked } = await updateDocument(id, await req.json());
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  return NextResponse.json({ ok: true, autoLinked });
});

/** Остаточне видалення — лише з архіву і лише власник. */
export const DELETE = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  await deleteArchivedDocument(id);
  revalidatePath("/inbox");
  return NextResponse.json({ ok: true });
});
