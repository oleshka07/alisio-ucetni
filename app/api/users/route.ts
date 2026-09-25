import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";

const FIELDS = { id: true, email: true, name: true, role: true, isActive: true, telegramChatId: true, lastLoginAt: true } as const;

export const GET = handle(async () => {
  await requireStaff(["owner"]);
  return NextResponse.json({ users: await prisma.user.findMany({ select: FIELDS, orderBy: { createdAt: "asc" } }) });
});

export const POST = handle(async (req: NextRequest) => {
  await requireStaff(["owner"]);
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Neplatný e-mail");
  if (password.length < 10) throw new HttpError(400, "Heslo musí mít alespoň 10 znaků");
  const role = body.role === "owner" ? "owner" : "accountant";
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, "Uživatel už existuje");
  const user = await prisma.user.create({
    data: { email, name: String(body.name || email), role, passwordHash: await bcrypt.hash(password, 10) },
    select: FIELDS,
  });
  return NextResponse.json({ user });
});
