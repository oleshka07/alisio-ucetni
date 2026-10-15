import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";

/** Token pro MCP konektor: „ucm_“ + 32 náhodných bajtů. V DB jen sha256. */
export function newToken(): string {
  return `ucm_${randomBytes(32).toString("base64url")}`;
}

export async function createApiToken(userId: string, name: string) {
  const token = newToken();
  const row = await prisma.apiToken.create({
    data: { userId, name: name.slice(0, 80) || "AI", tokenHash: sha256Hex(token), prefix: token.slice(0, 10) },
  });
  return { id: row.id, token };
}

/** Uživatel podle tokenu (aktivní, nezrušený token, aktivní uživatel s rolí owner/accountant). */
export async function userForToken(token: string | null | undefined) {
  if (!token || !/^ucm_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!row || row.revokedAt || !row.user.isActive || !["owner", "accountant"].includes(row.user.role)) return null;
  // lastUsedAt stačí aktualizovat jednou za minutu
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { user: row.user, tokenId: row.id };
}
