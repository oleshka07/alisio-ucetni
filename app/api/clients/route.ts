import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { safeProfileData } from "@/lib/profile-fields";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role === "client") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const basic = safeProfileData("basic", body.basic) ?? {};
    if (typeof basic.name !== "string" || !basic.name.trim()) return NextResponse.json({ error: "Zadejte název" }, { status: 400 });
    const company = safeProfileData("company", body.company);
    const employee = safeProfileData("employee", body.employee);
    const tax = safeProfileData("tax", body.tax);
    const insurance = safeProfileData("insurance", body.insurance);

    const client = await prisma.client.create({
      data: {
        name: basic.name,
        type: String(basic.type ?? "company"),
        role: String(basic.role ?? "owner"),
        color: typeof basic.color === "string" ? basic.color : "#6366f1",
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
