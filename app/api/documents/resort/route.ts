import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handle, requireStaff } from "@/lib/guard";
import { resortUnassigned } from "@/lib/docs/sort";

export const maxDuration = 300;

/** „Rozřadit znovu“: výpisy → výpisy, nerozpoznané → AI, rozpoznané → k platbám. */
export const POST = handle(async () => {
  await requireStaff();
  const report = await resortUnassigned();
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  revalidatePath("/statements");
  return NextResponse.json({ ok: true, ...report });
});
