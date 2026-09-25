import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { ensureSystemRules } from "@/lib/docs/rules";
import { ruleData } from "@/lib/docs/rule-fields";

export const GET = handle(async () => {
  await requireStaff();
  await ensureSystemRules();
  const rules = await prisma.docRequirementRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ rules });
});

export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const body = await req.json();
  if (!body.name) throw new HttpError(400, "Zadejte název pravidla");
  const rule = await prisma.docRequirementRule.create({ data: { name: String(body.name), ...ruleData(body) } as never });
  return NextResponse.json({ rule });
});
