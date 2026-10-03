import type { Metadata } from "next";

// Jediná veřejná stránka — vyhledávače ji smí indexovat, zbytek aplikace je za přihlášením.
export const metadata: Metadata = {
  title: "Přihlášení – ALISIO Accounting",
  description: "Účetní kabinet ALISIO: výpisy, doklady k platbám, daňový kalendář a datové schránky.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
