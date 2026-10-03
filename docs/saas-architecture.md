# Alisio Účetnictví → SaaS: návrh modelu (k odsouhlasení)

## Kdo produkt používá
1. **Účetní kancelář** — vede mnoho firem. Její účetní vidí všechny „své“ firmy.
2. **Firma, která vede doklady sama** — organizace s jednou firmou; její lidé mají **plný kabinet**
   (stejný jako účetní), jen pro svou firmu.
3. **Lidé firmy, kterou vede účetní** — vstupují do **stejné aplikace**, ale vidí jen svou firmu
   a mají omezené akce: nahrát doklady, vidět platby a termíny, odpovídat na požadavky účetní.
   Nevidí pravidla, nastavení kanceláře ani cizí firmy. Dnešní „portál“ se stane režimem aplikace.

## Datový model
- `Organization` (tenant): `type` = `practice` (kancelář) | `company` (sama sobě), název, tarif.
- `Membership` (uživatel ↔ organizace): role `admin` | `accountant` | `staff`.
- `ClientAccess` (uživatel ↔ konkrétní firma): role `client_admin` | `client_user` — lidé firmy klienta.
- `Client.organizationId` — každá firma patří jedné organizaci. Vše ostatní (účty, výpisy, platby,
  doklady, termíny, úkoly, pravidla, schránky) už visí na `clientId` → izolace přes firmu.
- Stávající data: migrace do jedné organizace (Swipe Scape), stávající uživatelé = její členové.

## Izolace dat (nejdůležitější část)
- Session nese `userId`, `organizationId` a seznam povolených `clientId`.
- Jedna vrstva `scope(session)` přidá podmínku do **každého** dotazu a API (žádné „zapomenuté“ místo).
- Testy: uživatel organizace A nevidí nic z organizace B; člověk firmy X nevidí firmu Y téže kanceláře.

## Přihlášení
- Všichni e-mail + heslo; lidé firem přes **pozvánku** (odkaz s jednorázovým tokenem).
- Dnešní 6místný kód → zrušit, nahradí ho pozvánka.
- Později: 2FA, přihlášení Google.

## Telegram
- Jeden sdílený bot; každý uživatel si připojí sám sebe.
- Upozornění dostávají členové organizace (podle role), ne jen „majitel“.

## Etapy
1. Model + migrace stávajících dat.
2. Izolace dat ve všech dotazech a API + testy.
3. Pozvánky a přihlášení lidí firem, omezený režim.
4. Registrace nové organizace a průvodce nastavením.
5. Později: tarify a platby, branding kanceláře.
