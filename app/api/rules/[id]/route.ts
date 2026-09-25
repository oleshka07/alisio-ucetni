import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { ruleData } from "@/lib/docs/rule-fields";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const body = await req.json();
  const rule = await prisma.docRequirementRule.findUnique({ where: { id } });
  if (!rule) throw new HttpError(404, "Pravidlo nenalezeno");
  // системні правила можна лише вмикати/вимикати
  const data = rule.isSystem ? { isActive: body.isActive !== false } : { ...(body.name ? { name: String(body.name) } : {}), ...ruleData(body) };
  return NextResponse.json({ rule: await prisma.docRequirementRule.update({ where: { id }, data: data as never }) });
});

export const DELETE = handle(async (_req: NextRequest, { params }: Ctx) => {
  await requireStaff(["owner"]);
  const { id } = await params;
  const rule = await prisma.docRequirementRule.findUnique({ where: { id } });
  if (!rule) throw new HttpError(404, "Pravidlo nenalezeno");
  if (rule.isSystem) throw new HttpError(400, "Systémové pravidlo lze jen vypnout");
  await prisma.docRequirementRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
