import { Prisma } from "@prisma/client";

/**
 * Білий список полів профілю клієнта. Дані з форми / AI ідуть у Prisma лише як прості значення
 * відомих скалярних полів — без вкладених записів (connect, deleteMany, зміни bankAccounts тощо)
 * і без службових полів.
 */
const SERVICE = new Set(["id", "clientId", "createdAt", "updatedAt"]);
const scalars = (e: Record<string, string>) => new Set(Object.values(e).filter((k) => !SERVICE.has(k)));

const FIELDS = {
  company: scalars(Prisma.CompanyProfileScalarFieldEnum),
  employee: scalars(Prisma.EmployeeProfileScalarFieldEnum),
  tax: scalars(Prisma.TaxProfileScalarFieldEnum),
  insurance: scalars(Prisma.InsuranceProfileScalarFieldEnum),
  // accessCode / isActive тут свідомо немає
  basic: new Set(["name", "type", "role", "color"]),
} as const;

export type ProfileSection = keyof typeof FIELDS;

export function safeProfileData(section: ProfileSection, input: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!FIELDS[section].has(k)) continue;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
