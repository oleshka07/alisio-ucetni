import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, clientId, priority, dueDate } = body;

    if (!title || !clientId) {
      return NextResponse.json({ error: "Název a klient jsou povinné" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        clientId,
        priority: priority || "normal",
        dueDate: dueDate ? new Date(dueDate) : null,
        status: "pending",
        createdBy: "accountant",
      },
    });

    return NextResponse.json({ success: true, task });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při vytváření úkolu" }, { status: 500 });
  }
}
