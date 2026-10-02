/** Kategorie firemních dokumentů (ne doklady k platbám). */
export const COMPANY_DOC_CATEGORIES = {
  registry: "Výpis z obchodního / živnostenského rejstříku",
  articles: "Zakladatelská listina / stanovy",
  license: "Oprávnění, licence, povolení",
  tax: "Daňové registrace, rozhodnutí FÚ",
  contract: "Smlouvy (nájem, úvěr, leasing…)",
  bank: "Bankovní smlouvy, podpisové vzory",
  hr: "Personální (vzory smluv, BOZP)",
  certificate: "Certifikáty, pojištění",
  other: "Ostatní",
} as const;

export type CompanyDocCategory = keyof typeof COMPANY_DOC_CATEGORIES;

export function companyDocCategoryLabel(c: string | null | undefined): string {
  return c && c in COMPANY_DOC_CATEGORIES ? COMPANY_DOC_CATEGORIES[c as CompanyDocCategory] : "Ostatní";
}
