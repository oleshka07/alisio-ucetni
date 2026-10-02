import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { readFile } from "@/lib/storage";

/** Оригінал виписки (PDF / XML) — для власника й бухгалтерки. */
export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const { id } = await params;
  const st = await prisma.bankStatement.findUnique({ where: { id } });
  if (!st?.fileUrl) throw new HttpError(404, "Soubor výpisu není uložen");
  const data = await readFile(st.fileUrl);
  const isPdf = data.subarray(0, 5).toString("latin1") === "%PDF-";
  const download = new URL(req.url).searchParams.has("download") || !isPdf;
  const name = encodeURIComponent(st.fileName || `vypis${isPdf ? ".pdf" : ".xml"}`);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
});
