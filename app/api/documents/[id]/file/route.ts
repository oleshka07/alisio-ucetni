import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";

/** Віддає файл документа (сховище приватне — пряме посилання на blob не відкривається). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.role === "client" && doc.clientId !== session.clientId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const data = await readFile(doc.fileUrl);
  // inline лише для безпечних типів; HTML/SVG тощо — тільки як завантаження (захист від XSS)
  const mime = doc.mimeType || "application/octet-stream";
  const safeInline = mime === "application/pdf" || /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(mime);
  const download = new URL(req.url).searchParams.has("download") || !safeInline;
  const name = encodeURIComponent(doc.originalName);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": safeInline ? mime : "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
