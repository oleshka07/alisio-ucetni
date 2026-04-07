import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Context for file operations (set per-request)
let currentFileContext: { base64: string; fileName: string; mimeType: string } | null = null;

export function setFileContext(ctx: typeof currentFileContext) {
  currentFileContext = ctx;
}

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/documents");
  revalidatePath("/portal");
  revalidatePath("/portal/tasks");
  revalidatePath("/portal/documents");
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "search_clients":
        return await searchClients(args);
      case "get_client_details":
        return await getClientDetails(args);
      case "create_client":
        return await createClient(args);
      case "update_client":
        return await updateClient(args);
      case "search_tasks":
        return await searchTasks(args);
      case "create_task":
        return await createTask(args);
      case "list_documents":
        return await listDocuments(args);
      case "save_document_to_client":
        return await saveDocumentToClient(args);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    console.error(`Tool ${name} error:`, err);
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" });
  }
}

// ─── Tool implementations ───────────────────────────────────────────────────

async function searchClients(args: Record<string, unknown>): Promise<string> {
  const query = (args.query as string) || "";
  const type = args.type as string | undefined;

  const where: Record<string, unknown> = { isActive: true };
  if (type) where.type = type;

  const clients = await prisma.client.findMany({
    where: {
      ...where,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { companyProfile: { companyName: { contains: query, mode: "insensitive" } } },
              { companyProfile: { ico: { contains: query } } },
              { employeeProfile: { firstName: { contains: query, mode: "insensitive" } } },
              { employeeProfile: { lastName: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    include: {
      companyProfile: { select: { companyName: true, ico: true } },
      employeeProfile: { select: { firstName: true, lastName: true } },
      _count: { select: { tasks: true, documents: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  if (clients.length === 0) return JSON.stringify({ message: "Žádní klienti nenalezeni.", clients: [] });

  return JSON.stringify({
    count: clients.length,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      role: c.role,
      companyName: c.companyProfile?.companyName,
      ico: c.companyProfile?.ico,
      firstName: c.employeeProfile?.firstName,
      lastName: c.employeeProfile?.lastName,
      tasksCount: c._count.tasks,
      documentsCount: c._count.documents,
    })),
  });
}

async function getClientDetails(args: Record<string, unknown>): Promise<string> {
  let clientId = args.clientId as string | undefined;
  const clientName = args.clientName as string | undefined;

  if (!clientId && clientName) {
    const found = await prisma.client.findMany({
      where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
      take: 5,
    });
    if (found.length === 0) return JSON.stringify({ error: `Klient "${clientName}" nenalezen.` });
    if (found.length > 1) {
      return JSON.stringify({
        message: "Nalezeno více klientů, upřesněte:",
        options: found.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      });
    }
    clientId = found[0].id;
  }

  if (!clientId) return JSON.stringify({ error: "Zadejte clientId nebo clientName." });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      companyProfile: true,
      employeeProfile: true,
      taxProfile: true,
      insuranceProfile: true,
      tasks: { orderBy: { createdAt: "desc" }, take: 10 },
      documents: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!client) return JSON.stringify({ error: "Klient nenalezen." });
  return JSON.stringify(client);
}

async function createClient(args: Record<string, unknown>): Promise<string> {
  const name = args.name as string;
  const type = args.type as string;
  const role = args.role as string;
  const companyData = args.company as Record<string, unknown> | undefined;
  const employeeData = args.employee as Record<string, unknown> | undefined;

  const client = await prisma.client.create({
    data: {
      name,
      type,
      role,
      ...(companyData ? { companyProfile: { create: companyData } } : {}),
      ...(employeeData ? { employeeProfile: { create: employeeData } } : {}),
    } as Parameters<typeof prisma.client.create>[0]["data"],
  });

  revalidateAll();
  return JSON.stringify({ success: true, message: `Klient "${name}" vytvořen.`, clientId: client.id });
}

async function updateClient(args: Record<string, unknown>): Promise<string> {
  const clientId = args.clientId as string;
  const basic = args.basic as Record<string, unknown> | undefined;
  const company = args.company as Record<string, unknown> | undefined;
  const employee = args.employee as Record<string, unknown> | undefined;
  const tax = args.tax as Record<string, unknown> | undefined;
  const insurance = args.insurance as Record<string, unknown> | undefined;

  await prisma.$transaction(async (tx) => {
    if (basic) {
      await tx.client.update({ where: { id: clientId }, data: basic as Parameters<typeof tx.client.update>[0]["data"] });
    }
    if (company) {
      await tx.companyProfile.upsert({
        where: { clientId },
        update: company as Parameters<typeof tx.companyProfile.update>[0]["data"],
        create: { ...company, clientId } as Parameters<typeof tx.companyProfile.create>[0]["data"],
      });
    }
    if (employee) {
      await tx.employeeProfile.upsert({
        where: { clientId },
        update: employee as Parameters<typeof tx.employeeProfile.update>[0]["data"],
        create: { ...employee, clientId } as Parameters<typeof tx.employeeProfile.create>[0]["data"],
      });
    }
    if (tax) {
      await tx.taxProfile.upsert({
        where: { clientId },
        update: tax as Parameters<typeof tx.taxProfile.update>[0]["data"],
        create: { ...tax, clientId } as Parameters<typeof tx.taxProfile.create>[0]["data"],
      });
    }
    if (insurance) {
      await tx.insuranceProfile.upsert({
        where: { clientId },
        update: insurance as Parameters<typeof tx.insuranceProfile.update>[0]["data"],
        create: { ...insurance, clientId } as Parameters<typeof tx.insuranceProfile.create>[0]["data"],
      });
    }
  });

  revalidateAll();
  revalidatePath(`/clients/${clientId}`);
  return JSON.stringify({ success: true, message: "Klient aktualizován." });
}

async function searchTasks(args: Record<string, unknown>): Promise<string> {
  let clientId = args.clientId as string | undefined;
  const clientName = args.clientName as string | undefined;
  const status = args.status as string | undefined;
  const query = args.query as string | undefined;

  if (!clientId && clientName) {
    const found = await prisma.client.findFirst({
      where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
    });
    if (found) clientId = found.id;
  }

  const tasks = await prisma.task.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return JSON.stringify({
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      clientName: t.client.name,
      createdAt: t.createdAt,
    })),
  });
}

async function createTask(args: Record<string, unknown>): Promise<string> {
  let clientId = args.clientId as string | undefined;
  const clientName = args.clientName as string | undefined;
  const title = args.title as string;

  if (!clientId && clientName) {
    const found = await prisma.client.findMany({
      where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
      take: 5,
    });
    if (found.length === 0) return JSON.stringify({ error: `Klient "${clientName}" nenalezen.` });
    if (found.length > 1) {
      return JSON.stringify({
        message: "Nalezeno více klientů, upřesněte:",
        options: found.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    clientId = found[0].id;
  }

  if (!clientId) return JSON.stringify({ error: "Není zadán klient pro úkol." });

  const task = await prisma.task.create({
    data: {
      clientId,
      title,
      description: (args.description as string) || null,
      priority: (args.priority as string) || "normal",
      dueDate: args.dueDate ? new Date(args.dueDate as string) : null,
      status: "pending",
      createdBy: "accountant",
    },
  });

  revalidateAll();
  return JSON.stringify({ success: true, message: `Úkol "${title}" vytvořen.`, taskId: task.id });
}

async function listDocuments(args: Record<string, unknown>): Promise<string> {
  let clientId = args.clientId as string | undefined;
  const clientName = args.clientName as string | undefined;

  if (!clientId && clientName) {
    const found = await prisma.client.findFirst({
      where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
    });
    if (found) clientId = found.id;
  }

  const docs = await prisma.document.findMany({
    where: clientId ? { clientId } : {},
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return JSON.stringify({
    count: docs.length,
    documents: docs.map((d) => ({
      id: d.id,
      name: d.originalName,
      size: d.fileSize,
      clientName: d.client.name,
      uploadedBy: d.uploadedBy,
      description: d.description,
      createdAt: d.createdAt,
      url: d.fileUrl,
    })),
  });
}

async function saveDocumentToClient(args: Record<string, unknown>): Promise<string> {
  if (!currentFileContext) {
    return JSON.stringify({ error: "Žádný soubor není k dispozici. Uživatel musí nejprve přiložit soubor." });
  }

  let clientId = args.clientId as string | undefined;
  const clientName = args.clientName as string | undefined;

  if (!clientId && clientName) {
    const found = await prisma.client.findMany({
      where: { name: { contains: clientName, mode: "insensitive" }, isActive: true },
      take: 5,
    });
    if (found.length === 0) return JSON.stringify({ error: `Klient "${clientName}" nenalezen.` });
    if (found.length > 1) {
      return JSON.stringify({
        message: "Nalezeno více klientů:",
        options: found.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    clientId = found[0].id;
  }

  if (!clientId) return JSON.stringify({ error: "Není zadán klient." });

  // Upload file to Vercel Blob
  const { put } = await import("@vercel/blob");
  const buffer = Buffer.from(currentFileContext.base64, "base64");
  const ext = currentFileContext.fileName.includes(".")
    ? "." + currentFileContext.fileName.split(".").pop()
    : "";
  const blobName = `documents/${clientId}/${crypto.randomUUID()}${ext}`;

  const blob = await put(blobName, buffer, {
      access: "private",
    addRandomSuffix: false,
    contentType: currentFileContext.mimeType,
  });

  const doc = await prisma.document.create({
    data: {
      clientId,
      filename: blobName,
      originalName: currentFileContext.fileName,
      fileSize: buffer.length,
      mimeType: currentFileContext.mimeType,
      fileUrl: blob.url,
      uploadedBy: "accountant",
      description: (args.description as string) || "",
    },
  });

  // Optionally create a task
  const taskTitle = args.taskTitle as string | undefined;
  if (taskTitle) {
    await prisma.task.create({
      data: {
        clientId,
        documentId: doc.id,
        title: taskTitle,
        status: "pending",
        priority: "normal",
        createdBy: "accountant",
      },
    });
  }

  revalidateAll();
  return JSON.stringify({
    success: true,
    message: `Dokument "${currentFileContext.fileName}" uložen ke klientovi.`,
    documentId: doc.id,
    url: blob.url,
  });
}
