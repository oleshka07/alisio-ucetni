import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { handle, HttpError } from "@/lib/guard";
import { syncTaxCalendar } from "@/lib/tax/sync";

const BOOL = ["taxCalendar", "vatPayer", "euSupplies", "hasEmployees", "hasWithholding", "flatTax", "roadTaxVehicles", "ownsRealEstate", "propertyTaxSplit"] as const;
const ENUMS = {
  taxEntity: ["legal", "osvc"],
  vatPeriod: ["monthly", "quarterly"],
  incomeTaxFiling: ["standard", "electronic", "advisor"],
  incomeTaxAdvances: ["none", "half", "quarter"],
} as const;

/** Nastavení daňového kalendáře firmy → hned přegeneruje termíny. Staff pro libovolnou firmu, klient portálu jen pro svou. */
export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Unauthorized");
  const { id } = await params;
  if (session.role === "client" && session.clientId !== id) throw new HttpError(403, "Access denied");
  if (!(await prisma.client.findUnique({ where: { id } }))) throw new HttpError(404, "Firma nenalezena");

  const body = await req.json();
  const data: Record<string, string | boolean | null> = {};
  for (const k of BOOL) if (typeof body[k] === "boolean") data[k] = body[k];
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (body[k] === undefined) continue;
    if (body[k] === null && k === "taxEntity") data[k] = null;
    else if ((allowed as readonly string[]).includes(body[k])) data[k] = body[k];
    else throw new HttpError(400, `Neplatná hodnota: ${k}`);
  }
  if (typeof body.dic === "string") data.dic = body.dic.trim().slice(0, 14) || null;

  await prisma.companyProfile.upsert({ where: { clientId: id }, update: data, create: { ...data, clientId: id } });
  const result = await syncTaxCalendar(id);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return NextResponse.json({ ok: true, ...result });
});
