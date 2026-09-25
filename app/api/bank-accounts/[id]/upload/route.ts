import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { importUploadedStatement } from "@/lib/bank/sync";

export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) throw new HttpError(404, "Účet nenalezen");
  const file = (await req.formData()).get("file") as File | null;
  if (!file) throw new HttpError(400, "Chybí soubor");
  try {
    const r = await importUploadedStatement(account, file.name, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/transactions");
    return NextResponse.json(r);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Import selhal");
  }
});
