import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { basic, company, employee, tax, insurance } = body;

    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          name: basic.name,
          type: basic.type,
          role: basic.role,
          color: basic.color,
        },
      });

      if (company) {
        await tx.companyProfile.upsert({
          where: { clientId: id },
          update: company,
          create: { ...company, clientId: id },
        });
      }

      if (employee) {
        await tx.employeeProfile.upsert({
          where: { clientId: id },
          update: employee,
          create: { ...employee, clientId: id },
        });
      }

      if (tax) {
        await tx.taxProfile.upsert({
          where: { clientId: id },
          update: tax,
          create: { ...tax, clientId: id },
        });
      }

      if (insurance) {
        await tx.insuranceProfile.upsert({
          where: { clientId: id },
          update: insurance,
          create: { ...insurance, clientId: id },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při ukládání klienta" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při mazání klienta" }, { status: 500 });
  }
}
