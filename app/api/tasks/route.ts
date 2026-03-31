import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, clientId, priority, dueDate } = body;

    if (!title || !clientId) {
      return NextResponse.json({ error: "Název a klient jsou povinné" }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "Klient neexistuje" }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        clientId,
        priority: priority || "normal",
        dueDate: dueDate ? new Date(dueDate) : null,
        status: "pending",
        createdBy: "accountant",
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    revalidatePath("/portal");
    revalidatePath("/portal/tasks");
    revalidatePath(`/clients/${clientId}`);

    return NextResponse.json({ success: true, task });
  } catch (err) {
    console.error("Task creation error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Chyba při vytváření úkolu: ${message}` }, { status: 500 });
  }
}
