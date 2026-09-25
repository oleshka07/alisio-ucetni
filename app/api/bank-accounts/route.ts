import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { PUBLIC_FIELDS, accountData } from "@/lib/bank/account-fields";

export const GET = handle(async () => {
  await requireStaff();
  const accounts = await prisma.bankAccount.findMany({ select: PUBLIC_FIELDS, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ accounts });
});

export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const body = await req.json();
  if (!body.clientId || !body.name) throw new HttpError(400, "Vyberte firmu a zadejte název účtu");
  const account = await prisma.bankAccount.create({
    data: { clientId: String(body.clientId), name: String(body.name), ...accountData(body) } as never,
    select: PUBLIC_FIELDS,
  });
  return NextResponse.json({ account });
});
