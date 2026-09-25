export const DOC_TYPES = {
  invoice_in: { cs: "Faktura přijatá", uk: "Вхідна фактура" },
  invoice_out: { cs: "Faktura vydaná", uk: "Видана фактура" },
  receipt: { cs: "Účtenka / pokladní doklad", uk: "Чек" },
  contract: { cs: "Smlouva", uk: "Договір" },
  cmr: { cs: "CMR / dodací list", uk: "CMR / накладна" },
  customs: { cs: "Celní prohlášení", uk: "Митна декларація" },
  payslip: { cs: "Výplatní páska", uk: "Розрахунковий лист" },
  other: { cs: "Jiný doklad", uk: "Інший документ" },
} as const;

export type DocType = keyof typeof DOC_TYPES;

export const CATEGORIES: Record<string, string> = {
  customer: "Příjem od odběratele",
  supplier: "Platba dodavateli",
  tax: "Daně a pojistné",
  salary: "Mzdy",
  internal: "Převod mezi vlastními účty",
  fee: "Bankovní poplatek",
  ads_foreign: "Zahraniční služby (reverse charge)",
  import: "Import zboží",
  other: "Ostatní",
};

export const DOC_STATUS: Record<string, { cs: string; uk: string; cls: string }> = {
  missing: { cs: "Chybí doklad", uk: "Немає документа", cls: "bg-red-100 text-red-700" },
  partial: { cs: "Neúplné", uk: "Не всі документи", cls: "bg-amber-100 text-amber-700" },
  complete: { cs: "Kompletní", uk: "Усе є", cls: "bg-emerald-100 text-emerald-700" },
  not_needed: { cs: "Není potřeba", uk: "Не потрібно", cls: "bg-slate-100 text-slate-600" },
};

export function docTypeLabel(t: string | null | undefined, lang: "cs" | "uk" = "cs"): string {
  if (!t) return lang === "cs" ? "Doklad" : "Документ";
  return (DOC_TYPES as Record<string, { cs: string; uk: string }>)[t]?.[lang] ?? t;
}
