/**
 * Daňový kalendář: generátor termínů pro firmu (s.r.o., a.s.) nebo OSVČ.
 * Čistá funkce bez DB — pravidla a zdroje viz docs/tax-calendar-rules.md.
 * Všechna data jsou „kalendářní dny“ v UTC půlnoci (bez časové zóny).
 */

export interface TaxSettings {
  entity: "legal" | "osvc";
  vatPayer: boolean;
  vatPeriod: "monthly" | "quarterly";
  euSupplies: boolean;
  hasEmployees: boolean;
  hasWithholding: boolean;
  incomeTaxFiling: "standard" | "electronic" | "advisor";
  incomeTaxAdvances: "none" | "half" | "quarter";
  flatTax: boolean; // paušální daň (jen OSVČ)
  roadTaxVehicles: boolean;
  ownsRealEstate: boolean;
  propertyTaxSplit: boolean; // daň z nemovitostí nad 5 000 Kč ve 2 splátkách
}

export interface Deadline {
  key: string; // jedinečný v rámci firmy, např. "vat:2026-09"
  kind: string;
  title: string;
  period: string; // "2026-09", "2026-Q3", "2025"
  dueDate: Date;
  files: boolean; // podává se přiznání / hlášení
  pays: boolean; // platí se
  accountPrefix?: string; // předčíslí účtu FÚ (…-matrika/0710) pro rozpoznání platby
  note?: string;
}

// ─── Datum a svátky ─────────────────────────────────────────────────────────

export const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Velikonoční neděle (anonymní gregoriánský algoritmus). */
export function easterSunday(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

const holidayCache = new Map<number, Set<string>>();
/** Státní svátky ČR (zák. 245/2000 Sb.). */
export function czHolidays(y: number): Set<string> {
  let s = holidayCache.get(y);
  if (!s) {
    const fixed = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"].map((md) => `${y}-${md}`);
    const easter = easterSunday(y);
    s = new Set([...fixed, iso(addDays(easter, -2)), iso(addDays(easter, 1))]);
    holidayCache.set(y, s);
  }
  return s;
}

export function isWorkday(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !czHolidays(d.getUTCFullYear()).has(iso(d));
}

/** §33 odst. 4 DŘ: konec lhůty v sobotu, neděli nebo svátek → nejbližší následující pracovní den. */
export function shiftToWorkday(d: Date): Date {
  let x = d;
  while (!isWorkday(x)) x = addDays(x, 1);
  return x;
}

// ─── Pomocné ───────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const MONTH_CS = ["", "leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
/** Měsíc následující po (y, m). */
const next = (y: number, m: number): [number, number] => (m === 12 ? [y + 1, 1] : [y, m + 1]);

/**
 * Termíny, jejichž datum splatnosti padne do [from, to].
 * Období se procházejí s rezervou (rok zpět), aby se zachytily i roční povinnosti.
 */
export function generateDeadlines(s: TaxSettings, from: Date, to: Date): Deadline[] {
  const out: Deadline[] = [];
  const add = (d: Omit<Deadline, "dueDate"> & { dueDate: Date; noShift?: boolean }) => {
    const { noShift, ...rest } = d;
    const due = noShift ? d.dueDate : shiftToWorkday(d.dueDate);
    if (due >= from && due <= to) out.push({ ...rest, dueDate: due });
  };
  const legal = s.entity === "legal";
  const incomePrefix = legal ? "7704" : "721";
  const incomeName = legal ? "DPPO" : "DPFO";

  const startY = from.getUTCFullYear() - 1;
  const endY = to.getUTCFullYear();

  // ── měsíční povinnosti: období = měsíc (y, m) ──
  for (let y = startY; y <= endY; y++) {
    for (let m = 1; m <= 12; m++) {
      const per = `${y}-${pad(m)}`;
      const label = `${MONTH_CS[m]} ${y}`;
      const [ny, nm] = next(y, m);
      const quarterEnd = m % 3 === 0;
      const q = `${y}-Q${m / 3}`;

      if (s.vatPayer) {
        if (s.vatPeriod === "monthly") {
          add({ key: `vat:${per}`, kind: "vat", title: `DPH za ${label} — přiznání a platba`, period: per, dueDate: ymd(ny, nm, 25), files: true, pays: true, accountPrefix: "705" });
        } else if (quarterEnd) {
          add({ key: `vat:${q}`, kind: "vat", title: `DPH za ${m / 3}. čtvrtletí ${y} — přiznání a platba`, period: q, dueDate: ymd(ny, nm, 25), files: true, pays: true, accountPrefix: "705" });
        }
        // kontrolní hlášení: PO vždy měsíčně, FO podle období DPH
        if (legal || s.vatPeriod === "monthly") {
          add({ key: `kh:${per}`, kind: "kh", title: `Kontrolní hlášení za ${label}`, period: per, dueDate: ymd(ny, nm, 25), files: true, pays: false });
        } else if (quarterEnd) {
          add({ key: `kh:${q}`, kind: "kh", title: `Kontrolní hlášení za ${m / 3}. čtvrtletí ${y}`, period: q, dueDate: ymd(ny, nm, 25), files: true, pays: false });
        }
      }
      if (s.euSupplies) {
        add({ key: `sh:${per}`, kind: "sh", title: `Souhrnné hlášení za ${label}`, period: per, dueDate: ymd(ny, nm, 25), files: true, pays: false, note: "Jen pokud v měsíci bylo dodání zboží / služeb do EU." });
      }

      if (s.hasEmployees) {
        add({
          key: `payroll:${per}`,
          kind: "payroll",
          title: `Mzdy za ${label} — záloha na daň, sociální a zdravotní pojištění`,
          period: per,
          dueDate: ymd(ny, nm, 20),
          files: true,
          pays: true,
          accountPrefix: "713",
          note: "Odvod zálohové daně (FÚ, předčíslí 713), pojistné ČSSZ a zdravotním pojišťovnám + přehled pro ZP.",
        });
        // JMHZ od období 04/2026; za 01–03/2026 souhrnně do 30.6.2026
        if (y > 2026 || (y === 2026 && m >= 4)) {
          add({ key: `jmhz:${per}`, kind: "jmhz", title: `JMHZ — jednotné měsíční hlášení za ${label}`, period: per, dueDate: ymd(ny, nm, 20), files: true, pays: false });
        }
      }
      if (s.hasWithholding) {
        add({ key: `withholding:${per}`, kind: "withholding", title: `Srážková daň za ${label} — odvod`, period: per, dueDate: ymd(ny, nm, lastDay(ny, nm)), files: false, pays: true, accountPrefix: "7720", note: "Jen pokud byla daň v měsíci sražena." });
      }

      if (!legal) {
        if (s.flatTax) {
          add({ key: `flat:${per}`, kind: "flat_tax", title: `Paušální daň za ${label}`, period: per, dueDate: ymd(y, m, 20), files: false, pays: true });
        } else {
          add({ key: `osvc_social:${per}`, kind: "osvc_social", title: `Záloha na sociální pojištění OSVČ za ${label}`, period: per, dueDate: ymd(y, m, lastDay(y, m)), files: false, pays: true, note: "Platba musí dorazit na účet OSSZ do konce měsíce." });
          add({ key: `osvc_health:${per}`, kind: "osvc_health", title: `Záloha na zdravotní pojištění OSVČ za ${label}`, period: per, dueDate: ymd(ny, nm, 8), files: false, pays: true });
        }
      }
    }
  }

  // ── roční povinnosti za rok y (termín v roce y+1) ──
  for (let y = startY; y <= endY; y++) {
    const ny = y + 1;
    const returnMonth = s.incomeTaxFiling === "advisor" ? 7 : s.incomeTaxFiling === "electronic" ? 5 : 4;
    const filingNote = s.incomeTaxFiling === "advisor" ? "Prodloužená lhůta s daňovým poradcem — plná moc musí být u FÚ do 1. 4." : s.incomeTaxFiling === "electronic" ? "Prodloužená lhůta při elektronickém podání." : undefined;

    if (!(!legal && s.flatTax)) {
      add({ key: `income_return:${y}`, kind: "income_return", title: `Přiznání k ${incomeName} za ${y} — podání a platba`, period: String(y), dueDate: ymd(ny, returnMonth, 1), files: true, pays: true, accountPrefix: incomePrefix, note: filingNote });
    }
    if (!legal && !s.flatTax) {
      // přehledy ČSSZ a ZP: měsíc po lhůtě pro přiznání (ČSSZ a ZP se mohou o dny lišit)
      add({ key: `osvc_overview:${y}`, kind: "osvc_overview", title: `Přehledy OSVČ za ${y} (ČSSZ a zdravotní pojišťovna)`, period: String(y), dueDate: ymd(ny, returnMonth + 1, 1), files: true, pays: true, note: "Doplatek pojistného do 8 dnů po podání přehledu. Termíny ČSSZ a ZP se mohou lišit — ověřte." });
    }
    if (!legal && s.flatTax) {
      add({ key: `flat_entry:${ny}`, kind: "flat_tax_entry", title: `Paušální režim na ${ny} — oznámení o vstupu (pokud ještě není)`, period: String(ny), dueDate: ymd(ny, 1, 10), files: true, pays: false });
    }
    if (legal) {
      add({ key: `statements:${y}`, kind: "statements", title: `Účetní závěrka za ${y} — zveřejnit ve Sbírce listin`, period: String(y), dueDate: ymd(ny, 12, 31), files: true, pays: false, noShift: true, note: "Nejpozději 12 měsíců po rozvahovém dni; s auditem do 30 dnů po schválení." });
    }
    if (s.hasEmployees && y <= 2026) {
      add({ key: `wage_statement:${y}`, kind: "wage_statement", title: `Vyúčtování daně ze závislé činnosti za ${y}`, period: String(y), dueDate: ymd(ny, 3, 20), files: true, pays: false, note: "Elektronicky do 20. 3., v papírové podobě do 1. 3." });
      add({ key: `annual_settlement:${y}`, kind: "annual_settlement", title: `Roční zúčtování záloh zaměstnanců za ${y}`, period: String(y), dueDate: ymd(ny, 3, 31), files: false, pays: false, note: "Žádosti zaměstnanců do 15. 2." });
    }
    if (s.hasWithholding) {
      add({ key: `withholding_statement:${y}`, kind: "withholding_statement", title: `Vyúčtování srážkové daně za ${y}`, period: String(y), dueDate: ymd(ny, 3, 31), files: true, pays: false });
    }
    if (s.roadTaxVehicles) {
      add({ key: `road_tax:${y}`, kind: "road_tax", title: `Silniční daň za ${y} — přiznání a platba`, period: String(y), dueDate: ymd(ny, 1, 31), files: true, pays: true, accountPrefix: "748" });
    }
    if (s.ownsRealEstate) {
      add({ key: `property_return:${ny}`, kind: "property_return", title: `Daň z nemovitostí na ${ny} — přiznání (jen při změně)`, period: String(ny), dueDate: ymd(ny, 1, 31), files: true, pays: false, note: "Podává se jen při nabytí / pozbytí nemovitosti nebo jiné změně." });
      add({ key: `property_pay:${ny}`, kind: "property_tax", title: `Daň z nemovitostí na ${ny}${s.propertyTaxSplit ? " — 1. splátka" : ""}`, period: String(ny), dueDate: ymd(ny, 5, 31), files: false, pays: true, accountPrefix: "7755" });
      if (s.propertyTaxSplit) {
        add({ key: `property_pay2:${ny}`, kind: "property_tax", title: `Daň z nemovitostí na ${ny} — 2. splátka`, period: String(ny), dueDate: ymd(ny, 11, 30), files: false, pays: true, accountPrefix: "7755" });
      }
    }
  }

  // ── zálohy na daň z příjmů (poslední známá daňová povinnost) ──
  if (s.incomeTaxAdvances !== "none" && !(!legal && s.flatTax)) {
    const months = s.incomeTaxAdvances === "quarter" ? [3, 6, 9, 12] : [6, 12];
    for (let y = startY; y <= endY + 1; y++) {
      for (const m of months) {
        add({ key: `income_advance:${y}-${pad(m)}`, kind: "income_advance", title: `Záloha na ${incomeName} (${s.incomeTaxAdvances === "quarter" ? "čtvrtletní" : "pololetní"})`, period: `${y}-${pad(m)}`, dueDate: ymd(y, m, 15), files: false, pays: true, accountPrefix: incomePrefix });
      }
    }
  }
  if (s.hasEmployees) {
    add({ key: "jmhz:2026-Q1", kind: "jmhz", title: "JMHZ za leden–březen 2026 (přechodné období)", period: "2026-Q1", dueDate: ymd(2026, 6, 30), files: true, pays: false });
  }

  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.key.localeCompare(b.key));
}

/** Předčíslí účtu FÚ → druhy termínů, které platba uhrazuje. */
export const PREFIX_KINDS: Record<string, string[]> = {
  "705": ["vat"],
  "7704": ["income_return", "income_advance"],
  "721": ["income_return", "income_advance"],
  "713": ["payroll"],
  "7720": ["withholding"],
  "7712": ["withholding"],
  "748": ["road_tax"],
  "7755": ["property_tax"],
};

/** „705-77628031/0710“ → "705"; jiné než účty FÚ u ČNB → null. */
export function taxAccountPrefix(account: string | null | undefined): string | null {
  const m = /^(\d{1,6})-\d{2,10}\/0710$/.exec((account || "").replace(/\s+/g, ""));
  return m && PREFIX_KINDS[m[1]] ? m[1] : null;
}
