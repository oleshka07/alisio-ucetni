import { NextResponse } from "next/server";
import { handle, requireStaff } from "@/lib/guard";
import { reapplyRules } from "@/lib/docs/rules";

export const maxDuration = 60;

/** Після зміни правил — перерахувати операції без ручного статусу. */
export const POST = handle(async () => {
  await requireStaff(["owner"]);
  return NextResponse.json({ ok: true, ...(await reapplyRules()) });
});
