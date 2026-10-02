import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { handle, HttpError } from "@/lib/guard";

/** Termín: hotovo / zaplaceno / vrátit / zrušit, případně částka. Klient portálu jen u své firmy. */
export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Unauthorized");
  const { id } = await params;
  const ev = await prisma.taxEvent.findUnique({ where: { id } });
  if (!ev) throw new HttpError(404, "Termín nenalezen");
  if (session.role === "client" && session.clientId !== ev.clientId) throw new HttpError(403, "Access denied");

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["upcoming", "done", "paid", "cancelled"].includes(body.status)) throw new HttpError(400, "Neplatný stav");
    data.status = body.status;
    data.doneAt = body.status === "upcoming" ? null : new Date();
    if (body.status === "upcoming") data.paidTransactionId = null;
  }
  if (body.amount !== undefined) {
    const n = body.amount === null || body.amount === "" ? null : Number(String(body.amount).replace(/\s/g, "").replace(",", "."));
    if (n !== null && !Number.isFinite(n)) throw new HttpError(400, "Neplatná částka");
    data.amount = n;
  }
  await prisma.taxEvent.update({ where: { id }, data });
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return NextResponse.json({ ok: true });
});
