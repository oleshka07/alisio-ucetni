import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { educationLabel, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import DocumentUploadForm from "@/components/DocumentUploadForm";
import { Building2, User, Phone, Mail, Globe } from "lucide-react";

export default async function AccountantViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      companyProfile: true,
      employeeProfile: true,
      taxProfile: true,
      insuranceProfile: true,
    },
  });

  if (!client) notFound();

  const cp = client.companyProfile;
  const ep = client.employeeProfile;
  const tp = client.taxProfile;
  const ip = client.insuranceProfile;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">ALISIO Accounting</p>
            <p className="text-xs text-gray-500">Podklady pro účetní</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Client card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: client.color + "20" }}
            >
              {client.type === "company" ? (
                <Building2 className="w-7 h-7" style={{ color: client.color }} />
              ) : (
                <User className="w-7 h-7" style={{ color: client.color }} />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
              <p className="text-sm text-gray-500">
                {client.type === "company" ? "Společnost" : "Fyzická osoba"} ·{" "}
                {client.role === "owner" ? "Majitel" : client.role === "director" ? "Ředitel/ka" : "Zaměstnanec"}
              </p>
            </div>
          </div>

          {cp && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              {cp.ico && <InfoItem label="IČO" value={cp.ico} mono />}
              {cp.dic && <InfoItem label="DIČ" value={cp.dic} mono />}
              {cp.legalForm && <InfoItem label="Právní forma" value={cp.legalForm} />}
              {cp.street && <InfoItem label="Adresa" value={`${cp.street}, ${cp.city} ${cp.zip}`} />}
              {cp.email && <InfoItem label="E-mail" value={cp.email} />}
              {cp.phone && <InfoItem label="Telefon" value={cp.phone} />}
              {cp.dataBox && <InfoItem label="Datová schránka" value={cp.dataBox} mono />}
              {cp.bankAccount && cp.bankCode && (
                <InfoItem label="Bankovní účet" value={`${cp.bankAccount}/${cp.bankCode}`} mono />
              )}
              {cp.vatPayer && <InfoItem label="Plátce DPH" value="Ano" />}
            </div>
          )}
        </div>

        {/* JMHZ Dotazník — full form */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Dotazník zaměstnance (JMHZ)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Jednotné měsíční hlášení zaměstnavatele — podklady
            </p>
          </div>

          <div className="p-6 space-y-8">
            {/* Section 1 */}
            {cp && (
              <FormSection number="1" title="Identifikace zaměstnavatele">
                <FormGrid>
                  <FormRow label="Název zaměstnavatele (firmy)" value={cp.companyName} />
                  <FormRow label="IČO" value={cp.ico} />
                  <FormRow label="Sídlo firmy (ulice, číslo)" value={cp.street} />
                  <FormRow label="Obec, PSČ" value={cp.city && cp.zip ? `${cp.city}, ${cp.zip}` : undefined} />
                  <FormRow label="Kontaktní osoba (jméno, příjmení)" value={cp.contactPerson} />
                  <FormRow label="Kontaktní osoba (telefon)" value={cp.phone} />
                  <FormRow label="E-mail / datová schránka" value={[cp.email, cp.dataBox].filter(Boolean).join(" / ")} />
                </FormGrid>
              </FormSection>
            )}

            {/* Section 2 */}
            {ep && (
              <FormSection number="2" title="Osobní, identifikační a kontaktní údaje zaměstnance">
                <FormGrid>
                  <FormRow label="Titul, jméno a příjmení" value={[ep.title, ep.firstName, ep.lastName].filter(Boolean).join(" ")} />
                  <FormRow label="Rodné příjmení" value={ep.birthSurname} />
                  <FormRow label="Datum narození (DD.MM.RRRR)" value={ep.birthDate} />
                  <FormRow label="Místo narození" value={ep.birthPlace} />
                  <FormRow label="Národnost" value={ep.nationality} />
                  <FormRow label="Státní občanství" value={ep.citizenship} />
                  <FormRow label="Rodné číslo" value={ep.birthNumber} />
                  <FormRow label="OIČ" value={ep.oic} />
                  <FormRow label="Číslo občanského průkazu" value={ep.idCardNumber} />
                  <FormRow label="Pohlaví" value={ep.gender === "M" ? "Muž" : ep.gender === "F" ? "Žena" : undefined} />
                </FormGrid>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trvalá adresa</p>
                  <FormGrid>
                    <FormRow label="Ulice, číslo popisné / orientační" value={ep.permStreet} />
                    <FormRow label="Obec, PSČ" value={ep.permCity && ep.permZip ? `${ep.permCity}, ${ep.permZip}` : undefined} />
                    <FormRow label="Stát" value={ep.permCountry} />
                  </FormGrid>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Kontaktní údaje</p>
                  <FormGrid>
                    <FormRow label="Telefon" value={ep.phone} />
                    <FormRow label="E-mail" value={ep.email} />
                    <FormRow label="Bankovní účet" value={ep.bankAccount} />
                    <FormRow label="Datová schránka" value={ep.dataBox} />
                  </FormGrid>
                </div>
              </FormSection>
            )}

            {/* Section 3 */}
            {tp && (
              <FormSection number="3" title="Daňové a pojistné údaje">
                <FormGrid>
                  <FormRow
                    label="Chce zaměstnanec roční zúčtování daní?"
                    value={tp.wantsYearlySettlement ? "Ano" : "Ne"}
                  />
                  <FormRow
                    label="Uplatňuje slevu na dani ze závislé činnosti?"
                    value={tp.wantsBasicTaxCredit ? "Ano" : "Ne"}
                  />
                  <FormRow
                    label="Nejvyšší dosažené vzdělání"
                    value={ep ? educationLabel(ep.education) : undefined}
                  />
                </FormGrid>
              </FormSection>
            )}

            {/* Section 4 */}
            {tp && (
              <FormSection number="4" title="Rodinné a sociální údaje">
                <FormGrid>
                  <FormRow label="Rodinný stav" value={
                    tp.maritalStatus === "married" ? "Ženatý/Vdaná" :
                    tp.maritalStatus === "single" ? "Svobodný/á" :
                    tp.maritalStatus === "divorced" ? "Rozvedený/á" :
                    tp.maritalStatus ?? undefined
                  } />
                  <FormRow label="Manžel(ka) – jméno" value={tp.spouseName} />
                  <FormRow label="Manžel(ka) – rodné číslo" value={tp.spouseBirthNumber} />
                  <FormRow label="Držitel karty ZTP/P" value={tp.isZTPP ? "Ano" : "Ne"} />
                  <FormRow label="Dítě 1 – rodné číslo" value={tp.child1BirthNumber} />
                  <FormRow label="Dítě 2 – rodné číslo" value={tp.child2BirthNumber} />
                  <FormRow label="Dítě 3 – rodné číslo" value={tp.child3BirthNumber} />
                  <FormRow
                    label="Uplatňuje daňové zvýhodnění na děti?"
                    value={tp.hasChildTaxCredit ? "Ano" : "Ne"}
                  />
                </FormGrid>
              </FormSection>
            )}

            {/* Section 5 */}
            {tp && (
              <FormSection number="5" title="Pracovní úvazek a místo výkonu práce">
                <FormGrid>
                  <FormRow label="Místo výkonu práce" value={tp.workLocation} />
                </FormGrid>
              </FormSection>
            )}

            {/* Section 6 */}
            {ip && (
              <FormSection number="6" title="Zdravotní pojištění a další výdělečná činnost">
                <FormGrid>
                  <FormRow label="Kód a název pojišťovny" value={`${ip.healthInsuranceCode ?? ""} ${ip.healthInsuranceName ?? ""}`.trim() || undefined} />
                  <FormRow label="Stupeň invalidity (I/II/III)" value={ip.invalidityDegree} />
                  <FormRow label="Další výdělečná činnost či jiné zaměstnání" value={ip.otherEmployment ? "Ano" : "Ne"} />
                  <FormRow label="Nařízené srážky ze mzdy (exekuce apod.)" value={ip.wageDeductions ? "Ano" : "Ne"} />
                  <FormRow label="Poživatel důchodu" value={ip.isPensioner ? "Ano" : "Ne"} />
                  <FormRow label="Typ důchodu" value={ip.pensionType} />
                  <FormRow label="Student" value={ip.isStudent ? "Ano" : "Ne"} />
                  <FormRow label="Poživatel peněžité pomoci v mateřství" value={ip.maternityBenefit ? "Ano" : "Ne"} />
                  <FormRow label="Příjemce rodičovského příspěvku" value={ip.parentalBenefit ? "Ano" : "Ne"} />
                  <FormRow label="Uchazeč o zaměstnání" value={ip.isJobSeeker ? "Ano" : "Ne"} />
                  <FormRow label="Osoba pečující o převážně bezmocnou osobu" value={ip.isCaregiving ? "Ano" : "Ne"} />
                  <FormRow label="Osoba celodenně pečující o dítě do 7 let" value={ip.isChildcareUnder7 ? "Ano" : "Ne"} />
                  <FormRow label="Jiný zaměstnavatel (pojištění)" value={ip.anotherEmployerName} />
                  <FormRow label="OSVČ – zálohy ZP z min. základu" value={ip.isSelfEmployedMinBase ? "Ano" : "Ne"} />
                </FormGrid>
              </FormSection>
            )}

            {/* Section 7 — Foreigner */}
            {ep?.isForeigner && (
              <FormSection number="7" title="Údaje pro cizince">
                <FormGrid>
                  <FormRow label="Typ cizince" value={ep.foreignerType === "EU" ? "Občan EU/EHP/Švýcarsko" : "Cizinec ze třetí země"} />
                  <FormRow label="Důvod pro volný přístup na trh" value={ep.freeAccessReason} />
                  <FormRow label="Druh oprávnění" value={ep.permitType} />
                  <FormRow label="Typ dokladu" value={ep.docType} />
                  <FormRow label="Číslo dokladu" value={ep.docNumber} />
                  <FormRow label="Stát vydání dokladu" value={ep.docCountry} />
                  <FormRow label="Platnost dokladu do" value={ep.docValidUntil} />
                  <FormRow label="Číslo potvrzení pobytu" value={ep.residenceConfirmNumber} />
                  <FormRow label="Adresa pobytu v ČR" value={[ep.residenceStreet, ep.residenceCity, ep.residenceZip].filter(Boolean).join(", ")} />
                  <FormRow label="Má české rodné číslo?" value={ep.hasCzBirthNumber ? "Ano" : "Ne"} />
                  <FormRow label="Název ZP" value={ep.healthInsuranceName} />
                  <FormRow label="Číslo ZP" value={ep.healthInsuranceNumber} />
                  <FormRow label="Karta pojištěnce" value={ep.hasInsuranceCard ? "Ano" : "Ne"} />
                  <FormRow label="Číslo SP" value={ep.socialInsuranceNumber} />
                  <FormRow label="Daňový status" value={ep.taxStatus} />
                  <FormRow label="Stát narození" value={ep.birthCountry} />
                </FormGrid>
              </FormSection>
            )}
          </div>
        </div>

        {/* Document upload */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-900">Zaslat dokument klientovi</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Nahrajte dokument — vytvoří se automaticky úkol pro klienta
            </p>
          </div>
          <div className="p-6">
            <DocumentUploadForm clientId={client.id} uploadedBy="accountant" />
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Dokument vygenerován systémem ALISIO Accounting ·{" "}
          {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeStyle: "short" }).format(new Date())}
        </p>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function FormSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
  );
}

function FormRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-gray-50 border border-gray-100">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">
        {value || <span className="text-gray-300 font-normal">—</span>}
      </span>
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-sm font-medium text-gray-900", mono && "font-mono")}>{value}</p>
    </div>
  );
}
