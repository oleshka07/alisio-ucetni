import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";
import { getOwnerInfo } from "@/lib/databox/isds";
import { syncDataBoxAccount, DATABOX_FIELDS } from "@/lib/databox/sync";

export const maxDuration = 60;

export const GET = handle(async () => {
  await requireStaff();
  return NextResponse.json({ databoxes: await prisma.dataBoxAccount.findMany({ select: DATABOX_FIELDS, orderBy: { createdAt: "asc" } }) });
});

/** Přidání schránky: nejdřív ověří přihlášení (GetOwnerInfoFromLogin), pak uloží heslo šifrovaně a hned stáhne zprávy. */
export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const b = await req.json();
  const username = String(b.username || "").trim();
  const password = String(b.password || "");
  if (!username || !password || !b.clientId) throw new HttpError(400, "Vyplňte firmu / osobu, uživatelské jméno a heslo");
  if (!(await prisma.client.findUnique({ where: { id: String(b.clientId) } }))) throw new HttpError(400, "Firma nenalezena");
  const environment = b.environment === "test" ? "test" : "production";
  const owner = await getOwnerInfo({ environment, username, password }).catch((e) => {
    throw new HttpError(400, e instanceof Error ? e.message : "Přihlášení do ISDS selhalo");
  });
  if (owner.dataBoxId && (await prisma.dataBoxAccount.findFirst({ where: { dataBoxId: owner.dataBoxId } }))) {
    throw new HttpError(400, `Schránka ${owner.dataBoxId} už je napojená`);
  }
  const acc = await prisma.dataBoxAccount.create({
    data: {
      name: String(b.name || owner.name || username).slice(0, 120),
      clientId: String(b.clientId),
      environment,
      username,
      passwordEnc: encryptSecret(password),
      dataBoxId: owner.dataBoxId,
      ownerName: owner.name,
    },
  });
  const sync = await syncDataBoxAccount(acc);
  return NextResponse.json({ databox: await prisma.dataBoxAccount.findUnique({ where: { id: acc.id }, select: DATABOX_FIELDS }), sync });
});
