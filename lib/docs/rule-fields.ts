import { HttpError } from "@/lib/guard";
import { DOC_TYPES, CATEGORIES } from "./types";

export function ruleData(body: Record<string, unknown>) {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() || null : undefined);
  const data: Record<string, unknown> = {};
  for (const k of ["counterpartyContains", "accountContains", "messageContains", "hint"]) {
    const v = str(k);
    if (v !== undefined) data[k] = v;
  }
  if (body.clientId !== undefined) data.clientId = body.clientId || null;
  if (body.direction !== undefined) {
    if (!["in", "out", "any"].includes(String(body.direction))) throw new HttpError(400, "Neplatný směr");
    data.direction = body.direction;
  }
  if (body.category !== undefined) {
    if (body.category && !(String(body.category) in CATEGORIES)) throw new HttpError(400, "Neplatná kategorie");
    data.category = body.category || null;
  }
  if (body.priority !== undefined) data.priority = Number(body.priority) || 100;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.notNeeded === "boolean") data.notNeeded = body.notNeeded;
  for (const k of ["minAbsAmount", "maxAbsAmount"]) {
    if (body[k] !== undefined) data[k] = body[k] === "" || body[k] == null ? null : Number(body[k]);
  }
  if (Array.isArray(body.requiredDocs)) {
    data.requiredDocs = (body.requiredDocs as string[]).filter((t) => t in DOC_TYPES);
  }
  return data;
}
