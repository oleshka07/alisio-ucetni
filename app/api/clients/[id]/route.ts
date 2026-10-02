import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { safeProfileData } from "@/lib/profile-fields";
import { revalidatePath } from "next/cache";

// Helper: detect changed fields between old and new data
function detectChanges(
  section: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown>
): Array<{ section: string; fieldName: string; oldValue: string; newValue: string }> {
  const changes: Array<{ section: string; fieldName: string; oldValue: string; newValue: string }> = [];
  if (!oldData) {
    // New section — log all non-empty fields
    for (const [key, value] of Object.entries(newData)) {
      if (value !== "" && value !== null && value !== undefined && key !== "clientId") {
        changes.push({ section, fieldName: key, oldValue: "", newValue: String(value) });
      }
    }
    return changes;
  }
  for (const [key, value] of Object.entries(newData)) {
    if (key === "clientId") continue;
    const oldVal = oldData[key];
    if (String(value ?? "") !== String(oldVal ?? "")) {
      changes.push({ section, fieldName: key, oldValue: String(oldVal ?? ""), newValue: String(value ?? "") });
    }
  }
  return changes;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // лише відомі прості поля — без вкладених записів Prisma (див. lib/profile-fields.ts)
    const basic = safeProfileData("basic", body.basic) ?? {};
    const company = safeProfileData("company", body.company);
    const employee = safeProfileData("employee", body.employee);
    const tax = safeProfileData("tax", body.tax);
    const insurance = safeProfileData("insurance", body.insurance);

    // Validate access: client can only update their own profile
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role === "client" && session.clientId !== id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // хто змінив — із сесії, не з параметра запиту
    const changedBy = session.role === "client" ? "client" : session.role;

    // Load old data for audit comparison
    const oldClient = await prisma.client.findUnique({
      where: { id },
      include: {
        companyProfile: true,
        employeeProfile: true,
        taxProfile: true,
        insuranceProfile: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: basic,
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

      // Detect and log changes
      const allChanges = [
        ...detectChanges("basic", oldClient ? { name: oldClient.name, type: oldClient.type, role: oldClient.role, color: oldClient.color } : null, basic),
        ...detectChanges("company", oldClient?.companyProfile as Record<string, unknown> | null, company || {}),
        ...detectChanges("employee", oldClient?.employeeProfile as Record<string, unknown> | null, employee || {}),
        ...detectChanges("tax", oldClient?.taxProfile as Record<string, unknown> | null, tax || {}),
        ...detectChanges("insurance", oldClient?.insuranceProfile as Record<string, unknown> | null, insurance || {}),
      ];

      if (allChanges.length > 0) {
        const summary = `Změněno ${allChanges.length} ${allChanges.length === 1 ? "pole" : allChanges.length < 5 ? "pole" : "polí"}: ${allChanges.map((c) => c.fieldName).join(", ")}`;

        await tx.auditLog.create({
          data: {
            clientId: id,
            action: "profile_updated",
            changedBy,
            summary,
            oldValue: JSON.stringify(Object.fromEntries(allChanges.map((c) => [c.fieldName, c.oldValue]))),
            newValue: JSON.stringify(Object.fromEntries(allChanges.map((c) => [c.fieldName, c.newValue]))),
          },
        });
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    revalidatePath("/documents");
    revalidatePath("/calendar");
    revalidatePath(`/clients/${id}`);
    revalidatePath("/portal");
    revalidatePath("/portal/profile");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při ukládání klienta" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // видалення фірми каскадом зносить платежі й документи — лише власник
  const session = await getSession();
  if (session?.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    await prisma.client.delete({ where: { id } });

    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    revalidatePath("/documents");
    revalidatePath("/calendar");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Chyba při mazání klienta" }, { status: 500 });
  }
}
