import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAccessCode } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Generate unique 6-digit code
    let code: string;
    let attempts = 0;
    do {
      code = generateAccessCode();
      const existing = await prisma.client.findUnique({ where: { accessCode: code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return NextResponse.json({ error: "Nepodařilo se vygenerovat unikátní kód" }, { status: 500 });
    }

    await prisma.client.update({
      where: { id },
      data: {
        accessCode: code,
        accessCodeCreatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, accessCode: code });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při generování kódu" }, { status: 500 });
  }
}

// DELETE — remove access code (revoke client access)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    await prisma.client.update({
      where: { id },
      data: {
        accessCode: null,
        accessCodeCreatedAt: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při odebírání přístupu" }, { status: 500 });
  }
}
