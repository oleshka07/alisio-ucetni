import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, priority, notes } = body;

    // Validate access: client can only modify their own tasks
    const session = await getSession();
    if (session?.role === "client") {
      const task = await prisma.task.findUnique({
        where: { id },
        select: { clientId: true },
      });
      if (!task || task.clientId !== session.clientId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (priority) data.priority = priority;
    if (notes !== undefined) data.notes = notes;

    const task = await prisma.task.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, task });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při aktualizaci úkolu" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při mazání úkolu" }, { status: 500 });
  }
}
