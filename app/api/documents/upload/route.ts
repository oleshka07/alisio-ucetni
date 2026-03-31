import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientId = formData.get("clientId") as string;
    const uploadedBy = (formData.get("uploadedBy") as string) || "accountant";
    const description = (formData.get("description") as string) || "";
    const taskTitle = (formData.get("taskTitle") as string) || `Dokument: ${file?.name}`;

    if (!file || !clientId) {
      return NextResponse.json({ error: "Missing file or clientId" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Soubor je příliš velký (max 20 MB)" }, { status: 400 });
    }

    // Upload to Vercel Blob
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
    const blobName = `documents/${clientId}/${crypto.randomUUID()}${ext}`;
    
    const blob = await put(blobName, file, {
      access: "public",
      addRandomSuffix: false,
    });

    const fileUrl = blob.url;

    // Create document + task in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          clientId,
          filename: blobName,
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          fileUrl,
          uploadedBy,
          description,
        },
      });

      const task = await tx.task.create({
        data: {
          clientId,
          documentId: doc.id,
          title: taskTitle,
          description: description || `Dokument "${file.name}" byl nahrán. Prosím zkontrolujte.`,
          status: "pending",
          priority: "normal",
          createdBy: uploadedBy,
        },
      });

      return { doc, task };
    });

    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    revalidatePath("/documents");
    revalidatePath("/portal");
    revalidatePath("/portal/tasks");
    revalidatePath("/portal/documents");
    revalidatePath(`/clients/${clientId}`);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
