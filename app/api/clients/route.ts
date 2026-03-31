import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { basic, company, employee, tax, insurance } = body;

    const client = await prisma.client.create({
      data: {
        name: basic.name,
        type: basic.type,
        role: basic.role,
        color: basic.color ?? "#6366f1",
        companyProfile: company ? { create: company } : undefined,
        employeeProfile: employee ? { create: employee } : undefined,
        taxProfile: tax ? { create: tax } : undefined,
        insuranceProfile: insurance ? { create: insurance } : undefined,
      },
    });

    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při vytváření klienta" }, { status: 500 });
  }
}
