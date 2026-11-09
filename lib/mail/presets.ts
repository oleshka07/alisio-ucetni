/**
 * Пресети IMAP для форми «Pošta» (Nastavení → Schránky) і підказки під ними.
 * Чистий модуль без імпортів — його читає і форма, і тест.
 *
 * Підказки не стверджують точних назв пунктів меню провайдера (вони змінюються без нашого відома):
 * кажуть, ЩО має бути вимкнено/увімкнено, а де саме — шукати в налаштуваннях схованки.
 */
export interface ImapPreset {
  label: string;
  host: string;
  /** Коротка інструкція під полем сервера; чеською, як і весь екран. */
  hint?: string;
}

export const IMAP_PRESETS: readonly ImapPreset[] = [
  { label: "Gmail / Google Workspace", host: "imap.gmail.com" },
  {
    label: "Seznam / Email.cz",
    host: "imap.seznam.cz",
    hint:
      "Uživatel je celá e-mailová adresa (např. jmeno@email.cz), port 993 (SSL). " +
      "V nastavení e-mailu na seznam.cz zkontrolujte, že je povolen přístup přes IMAP. " +
      "Pokud máte zapnuté dvoufázové ověření, vytvořte v nastavení účtu Seznam heslo pro externí aplikace " +
      "a zadejte ho místo hesla ke schránce.",
  },
  {
    label: "Centrum.cz",
    host: "imap.centrum.cz",
    hint:
      "Uživatel je celá e-mailová adresa, port 993 (SSL). V nastavení e-mailu na centrum.cz zkontrolujte, " +
      "že je povolen přístup přes IMAP; při zapnutém dvoufázovém ověření použijte heslo pro aplikace.",
  },
  { label: "Outlook / Microsoft 365", host: "outlook.office365.com" },
];

/** Přesná shoda hostu (bez ohledu na velikost písmen a mezery na krajích) — ne podřetězec. */
export function imapPresetFor(host: string): ImapPreset | null {
  const h = host.trim().toLowerCase();
  if (!h) return null;
  return IMAP_PRESETS.find((p) => p.host === h) ?? null;
}
