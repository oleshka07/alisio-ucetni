import { HttpError } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";

export const PUBLIC_FIELDS = {
  id: true, clientId: true, name: true, accountNumber: true, iban: true, currency: true, isActive: true,
  source: true, imapHost: true, imapPort: true, imapUser: true, imapFolder: true, senderFilter: true,
  lastSyncAt: true, lastError: true, createdAt: true,
} as const;

export function accountData(body: Record<string, unknown>) {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() || null : undefined);
  const data: Record<string, unknown> = {};
  for (const k of ["name", "accountNumber", "iban", "currency", "source", "imapHost", "imapUser", "imapFolder", "senderFilter"]) {
    const v = s(k);
    if (v !== undefined) data[k] = v;
  }
  if (data.iban) data.iban = String(data.iban).replace(/\s+/g, "").toUpperCase();
  if (body.imapPort != null && body.imapPort !== "") data.imapPort = Number(body.imapPort);
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.imapPassword === "string" && body.imapPassword) data.imapPasswordEnc = encryptSecret(body.imapPassword);
  if (typeof body.fioToken === "string" && body.fioToken) data.fioTokenEnc = encryptSecret(body.fioToken.trim());
  if (data.source && !["imap_camt", "fio_api", "manual"].includes(String(data.source))) throw new HttpError(400, "Neplatný zdroj");
  return data;
}

