import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { linkDocument } from "@/lib/docs/ingest";

export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireStaff();
  const { id } = await params;
  const { documentId } = await req.json();
  if (!documentId) throw new HttpError(400, "Chybí documentId");
  const status = await linkDocument(id, String(documentId), session.role);
  revalidatePath(`/transactions/${id}`);
  revalidatePath("/inbox");
  return NextResponse.json({ ok: true, status });
});
