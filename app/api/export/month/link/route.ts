import { NextRequest, NextResponse } from "next/server";
import { buildMonthZip, verifyExportLink } from "@/lib/finance/month-export";

export const maxDuration = 60;

/** Stažení ZIPu za měsíc z odkazu v e-mailu účetní — bez přihlášení, podepsané (HMAC), platí 30 dní. */
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const clientId = u.searchParams.get("c") || "";
  const month = u.searchParams.get("m") || "";
  const exp = Number(u.searchParams.get("exp"));
  const sig = u.searchParams.get("sig") || "";
  if (!/^\d{4}-\d{2}$/.test(month) || !verifyExportLink(clientId, month, exp, sig)) {
    return new NextResponse("Odkaz je neplatný nebo vypršel. Požádejte o nový.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const z = await buildMonthZip(clientId, month);
  return new NextResponse(z.buf as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${z.fileName}"`, "Cache-Control": "no-store" },
  });
}
