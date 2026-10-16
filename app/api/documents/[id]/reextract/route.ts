import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff } from "@/lib/guard";
import { reprocessDocument } from "@/lib/docs/ingest";

export const maxDuration = 120;

/** Rozpoznat doklad znovu (AI) a zkusit ho přiřadit k platbě. */
export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const r = await reprocessDocument(id);
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  return NextResponse.json({
    ok: r.document.aiStatus === "done",
    autoLinked: !!r.autoLinked,
    candidates: r.candidates.length,
  });
});
