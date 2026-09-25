import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";

export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireStaff(["owner"]);
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") {
    if (id === session.userId && !body.isActive) throw new HttpError(400, "Nelze deaktivovat sám sebe");
    data.isActive = body.isActive;
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 10) throw new HttpError(400, "Heslo musí mít alespoň 10 znaků");
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (body.disconnectTelegram) data.telegramChatId = null;
  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
});
