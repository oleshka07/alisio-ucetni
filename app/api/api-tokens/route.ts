import { NextRequest, NextResponse } from "next/server";
import { handle, requireStaff, HttpError } from "@/lib/guard";
import { createApiToken } from "@/lib/mcp/tokens";

/** Nový token pro MCP konektor. Celý token se ukáže jen jednou — v DB je jen hash. */
export const POST = handle(async (req: NextRequest) => {
  const session = await requireStaff(["owner"]);
  if (!session.userId) throw new HttpError(400, "Přihlaste se znovu");
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Claude";
  const { id, token } = await createApiToken(session.userId, name);
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return NextResponse.json({ id, token, url: `${base}/api/mcp/${token}` });
});
