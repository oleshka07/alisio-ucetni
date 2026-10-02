# Daňový kalendář — pravidla (zdroj pro `lib/tax/calendar.ts`)

Rešerše 10/2026. Ověřeno: **[P]** primární zdroj (financnisprava.gov.cz, cssz.gov.cz, vzp.cz, jmhz.mpsv.cz),
**[S]** sekundární (účetní portály), **UNVERIFIED** — nepotvrzeno. Před ostrým použitím u klientů
ověřit UNVERIFIED body proti „Daňový kalendář“ FS a PDF „Jak správně zaplatit daň FÚ v roce 2026“.

## Posun lhůty (§33 odst. 4 daňového řádu)
Připadne-li konec lhůty na sobotu, neděli nebo svátek, je posledním dnem nejbližší následující pracovní den.
Platí pro podání i splatnost daní; ČSSZ a zdravotní pojišťovny posouvají stejně [P].
Neposouváme: Sbírka listin (12 měsíců po rozvahovém dni) — konzervativně.
Svátky: 1.1, 1.5, 8.5, 5.7, 6.7, 28.9, 28.10, 17.11, 24.12, 25.12, 26.12 + Velký pátek a Velikonoční pondělí.

## DPH (zák. 235/2004)
| Povinnost | Kdo | Lhůta | Zdroj |
|---|---|---|---|
| Přiznání + platba | plátce, měsíční / čtvrtletní | 25. den po skončení období | [P] FS souhrn novely DPH 2025 |
| Kontrolní hlášení — PO | každá PO plátce (i čtvrtletní) | měsíčně, 25. den | [P] financnisprava.gov.cz/…/kontrolni-hlaseni-dph/kdy |
| Kontrolní hlášení — FO | OSVČ plátce | dle období DPH, 25. den | [P] tamtéž |
| Souhrnné hlášení | dodání zboží/služeb do EU | měsíčně, 25. den (čtvrtletně jen služby) | [P]/[S] |
| Identifikovaná osoba | jen v měsíci s povinností | 25. den — **negenerujeme automaticky** (vázáno na událost) | [S] |

## Daň z příjmů (zák. 586/1992, DŘ §136)
| Povinnost | Lhůta | Zdroj |
|---|---|---|
| Přiznání + platba (PO i FO) | 1. den 4. měsíce; elektronicky 1. den 5. měsíce; daňový poradce / audit 1. den 7. měsíce | [S] dauc.cz, investice.cz; data 2026 ověřena proti výpisu kalendáře FS |
| Zálohy — poslední daňová povinnost ≤ 30 000 | žádné | [S] |
| Zálohy 30 000–150 000 | 15.6 a 15.12 (40 %) | [S] |
| Zálohy > 150 000 | 15.3, 15.6, 15.9, 15.12 (25 %) | [S] |
| Paušální daň (OSVČ) | platba do 20. dne téhož měsíce, oznámení o vstupu do 10.1 | [P] FS tisková zpráva 2025 |
Hospodářský rok: **UNVERIFIED** — kalendář zatím jen pro kalendářní rok.

## Zaměstnavatel
| Povinnost | Lhůta | Zdroj |
|---|---|---|
| Záloha na daň ze závislé činnosti, sociální a zdravotní pojištění | do 20. dne následujícího měsíce | [P] cssz.gov.cz, vzp.cz |
| Srážková daň (§38d) | do konce následujícího měsíce | [S] |
| JMHZ (jednotné měsíční hlášení) | 1.–20. den následujícího měsíce, od období 04/2026; za 01–03/2026 do 30.6.2026 | [P] cssz.gov.cz/kdo-podava-jmh- |
| Přehled pro zdravotní pojišťovnu | měsíčně (JMHZ jej **nenahrazuje**), do 20. — termín UNVERIFIED | [P] vzp.cz |
| Vyúčtování daně ze závislé činnosti | 1.3 (papír) / 20.3 (elektronicky) — za roky ≤ 2026 | [P] |
| Vyúčtování srážkové daně | konec 3. měsíce — UNVERIFIED | [S] |
| Roční zúčtování | dokončit do 31.3 — UNVERIFIED | [S] |

## OSVČ pojistné
| Povinnost | Lhůta | Zdroj |
|---|---|---|
| Záloha na sociální pojištění | v měsíci, za který se platí (do posledního dne) | [P] cssz.gov.cz/platba-a-terminy |
| Záloha na zdravotní pojištění | do 8. dne následujícího měsíce | [S] |
| Přehledy ČSSZ / ZP | měsíc po lhůtě pro přiznání; ČSSZ a ZP se mohou lišit (2026: 2.6 vs 4.6 při elektronickém prodloužení) | [P] cssz.gov.cz, vzp.cz |

## Ostatní
| Povinnost | Lhůta | Zdroj |
|---|---|---|
| Silniční daň | přiznání + platba do 31.1 následujícího roku; **zálohy zrušeny od 2022** | [P] FS informace k novele 2022 |
| Daň z nemovitých věcí | přiznání do 31.1 jen při změně; platba do 31.5 (nad 5 000 Kč lze 31.5 + 30.11) | [P] kalendář FS |
| Účetní závěrka do Sbírky listin | nejpozději 12 měsíců po rozvahovém dni (neposouváme) | [S] §21a ZoÚ |

## Rozpoznání plateb (účty FÚ `PŘEDČÍSLÍ-MATRIKA/0710`, VS = DIČ bez CZ)
| Daň | Předčíslí |
|---|---|
| DPH | 705 [P] |
| DPPO (+ zálohy) | 7704 [P] |
| DPFO z přiznání (+ zálohy) | 721 [P] |
| Daň ze závislé činnosti (zálohová) | 713 [P] |
| Srážková daň FO / PO | 7720 / 7712 |
| Silniční daň | 748 [S] |
| Daň z nemovitých věcí | 7755 |
ČSSZ: předčíslí 1011 / 11017 / 21012 na účtu OSSZ u ČNB, VS přiděluje OSSZ. Zdravotní pojišťovny: VS = IČO + 2 číslice, KS 0558.
