import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";

/** Змінити власний пароль. */
export const PATCH = handle(async (req: NextRequest) => {
  const session = await requireStaff();
  const { currentPassword, newPassword } = await req.json();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await bcrypt.compare(String(currentPassword || ""), user.passwordHash))) {
    throw new HttpError(400, "Současné heslo nesouhlasí");
  }
  if (String(newPassword || "").length < 10) throw new HttpError(400, "Heslo musí mít alespoň 10 znaků");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  return NextResponse.json({ ok: true });
});
