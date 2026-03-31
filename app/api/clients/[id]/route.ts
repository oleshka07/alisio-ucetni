import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
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
    const { basic, company, employee, tax, insurance } = body;

    // Validate access: client can only update their own profile
    const session = await getSession();
    if (session?.role === "client" && session.clientId !== id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get changedBy from query params
    const changedBy = req.nextUrl.searchParams.get("changedBy") || "accountant";

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
