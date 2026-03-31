"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Save, Loader2, Building2, User, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientData = {
  basic: { name: string; type: string; role: string; color: string };
  company: Record<string, string | boolean>;
  employee: Record<string, string | boolean>;
  tax: Record<string, string | boolean>;
  insurance: Record<string, string | boolean>;
};

const COLORS = [
  "#6366f1", "#ec4899", "#10b981", "#f59e0b",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

const TABS = [
  { id: "basic",     label: "Základní info" },
  { id: "company",   label: "Společnost" },
  { id: "employee",  label: "Osobní údaje" },
  { id: "tax",       label: "Daně a rodina" },
  { id: "insurance", label: "Pojištění" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientForm({
  initialData,
  clientId,
  mode,
}: {
  initialData?: Partial<ClientData>;
  clientId?: string;
  mode: "new" | "edit";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const [basic, setBasic] = useState({
    name: "", type: "company", role: "owner", color: "#6366f1",
    ...initialData?.basic,
  });
  const [company, setCompany] = useState<Record<string, string | boolean>>({
    companyName: "", ico: "", dic: "", street: "", city: "", zip: "",
    country: "CZ", contactPerson: "", phone: "", email: "", dataBox: "",
    bankAccount: "", bankCode: "", iban: "", vatPayer: false, vatPeriod: "quarterly",
    registrationDate: "", legalForm: "s.r.o.", businessActivity: "", notes: "",
    ...initialData?.company,
  });
  const [employee, setEmployee] = useState<Record<string, string | boolean>>({
    title: "", firstName: "", lastName: "", birthSurname: "", birthDate: "",
    birthPlace: "", birthCountry: "", nationality: "", citizenship: "",
    birthNumber: "", oic: "", idCardNumber: "", gender: "",
    permStreet: "", permCity: "", permZip: "", permCountry: "CZ",
    tempStreet: "", tempCity: "", tempZip: "", tempCountry: "",
    phone: "", email: "", bankAccount: "", bankCode: "", iban: "", dataBox: "",
    education: "", isForeigner: false, foreignerType: "ThirdCountry",
    freeAccessReason: "", permitType: "", docType: "Passport",
    docNumber: "", docCountry: "", docValidUntil: "",
    residenceConfirmNumber: "", residenceStreet: "", residenceCity: "",
    residenceZip: "", hasCzBirthNumber: true,
    healthInsuranceName: "", healthInsuranceNumber: "", hasInsuranceCard: true,
    socialInsuranceNumber: "", taxStatus: "Resident", notes: "",
    ...initialData?.employee,
  });
  const [tax, setTax] = useState<Record<string, string | boolean>>({
    wantsYearlySettlement: true, wantsBasicTaxCredit: true,
    maritalStatus: "single", spouseName: "", spouseBirthNumber: "",
    isZTPP: false, child1BirthNumber: "", child2BirthNumber: "",
    child3BirthNumber: "", hasChildTaxCredit: false, workLocation: "", notes: "",
    ...initialData?.tax,
  });
  const [insurance, setInsurance] = useState<Record<string, string | boolean>>({
    healthInsuranceCode: "", healthInsuranceName: "", invalidityDegree: "",
    otherEmployment: false, wageDeductions: false, isPensioner: false,
    pensionType: "", isStudent: false, maternityBenefit: false,
    parentalBenefit: false, isJobSeeker: false, isCaregiving: false,
    isChildcareUnder7: false, anotherEmployerWithInsurance: false,
    anotherEmployerName: "", isSelfEmployedMinBase: false, notes: "",
    ...initialData?.insurance,
  });

  const handleSubmit = async () => {
    if (!basic.name.trim()) {
      toast.error("Zadejte název klienta");
      setActiveTab("basic");
      return;
    }
    setSaving(true);
    try {
      const payload = { basic, company, employee, tax, insurance };
      const url = mode === "new" ? "/api/clients" : `/api/clients/${clientId}`;
      const method = mode === "new" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      const data = await res.json();
      toast.success(mode === "new" ? "Klient vytvořen!" : "Uloženo!");
      router.push(`/clients/${mode === "new" ? data.client.id : clientId}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Chyba při ukládání");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0",
              activeTab === tab.id
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-card border border-border rounded-xl p-6">

        {/* ── Základní info ── */}
        {activeTab === "basic" && (
          <div className="space-y-5">
            <SectionTitle>Základní informace o klientovi</SectionTitle>
            <FormGrid>
              <FormField label="Název / Jméno *" span={2}>
                <Input value={basic.name} onChange={(v) => setBasic({ ...basic, name: v })} placeholder="Např. ALISIO s.r.o." />
              </FormField>
              <FormField label="Typ">
                <Select value={basic.type} onChange={(v) => setBasic({ ...basic, type: v })}>
                  <option value="company">Společnost / firma</option>
                  <option value="person">Fyzická osoba</option>
                </Select>
              </FormField>
              <FormField label="Role">
                <Select value={basic.role} onChange={(v) => setBasic({ ...basic, role: v })}>
                  <option value="owner">Majitel</option>
                  <option value="director">Ředitel/ka</option>
                  <option value="employee">Zaměstnanec</option>
                </Select>
              </FormField>
            </FormGrid>
            <FormField label="Barva v navigaci">
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBasic({ ...basic, color: c })}
                    className={cn(
                      "w-8 h-8 rounded-lg border-2 transition-all",
                      basic.color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </FormField>
            <div className="p-4 bg-muted rounded-lg flex items-center gap-3 mt-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: basic.color + "20" }}>
                {basic.type === "company"
                  ? <Building2 className="w-5 h-5" style={{ color: basic.color }} />
                  : <User className="w-5 h-5" style={{ color: basic.color }} />}
              </div>
              <div>
                <p className="font-medium text-sm">{basic.name || "Název klienta"}</p>
                <p className="text-xs text-muted-foreground">{basic.type === "company" ? "Společnost" : "Fyzická osoba"} · {basic.role === "owner" ? "Majitel" : basic.role === "director" ? "Ředitel/ka" : "Zaměstnanec"}</p>
              </div>
            </div>
            <NextTabBtn onClick={() => setActiveTab("company")} />
          </div>
        )}

        {/* ── Společnost ── */}
        {activeTab === "company" && (
          <div className="space-y-5">
            <SectionTitle>1. Identifikace zaměstnavatele / společnosti</SectionTitle>
            <FormGrid>
              <FormField label="Název firmy" span={2}><Input value={s(company.companyName)} onChange={(v) => setCompany({ ...company, companyName: v })} /></FormField>
              <FormField label="IČO"><Input value={s(company.ico)} onChange={(v) => setCompany({ ...company, ico: v })} placeholder="12345678" /></FormField>
              <FormField label="DIČ / IČ DPH"><Input value={s(company.dic)} onChange={(v) => setCompany({ ...company, dic: v })} placeholder="CZ12345678" /></FormField>
              <FormField label="Právní forma">
                <Select value={s(company.legalForm)} onChange={(v) => setCompany({ ...company, legalForm: v })}>
                  <option value="s.r.o.">s.r.o.</option>
                  <option value="a.s.">a.s.</option>
                  <option value="OSVČ">OSVČ</option>
                  <option value="v.o.s.">v.o.s.</option>
                  <option value="k.s.">k.s.</option>
                  <option value="Jiné">Jiné</option>
                </Select>
              </FormField>
              <FormField label="Datum registrace"><Input type="date" value={s(company.registrationDate)} onChange={(v) => setCompany({ ...company, registrationDate: v })} /></FormField>
              <FormField label="Ulice, č.p." span={2}><Input value={s(company.street)} onChange={(v) => setCompany({ ...company, street: v })} placeholder="Václavské náměstí 1" /></FormField>
              <FormField label="Obec"><Input value={s(company.city)} onChange={(v) => setCompany({ ...company, city: v })} /></FormField>
              <FormField label="PSČ"><Input value={s(company.zip)} onChange={(v) => setCompany({ ...company, zip: v })} placeholder="110 00" /></FormField>
              <FormField label="Stát"><Input value={s(company.country)} onChange={(v) => setCompany({ ...company, country: v })} placeholder="CZ" /></FormField>
              <FormField label="Kontaktní osoba"><Input value={s(company.contactPerson)} onChange={(v) => setCompany({ ...company, contactPerson: v })} /></FormField>
              <FormField label="Telefon"><Input value={s(company.phone)} onChange={(v) => setCompany({ ...company, phone: v })} placeholder="+420 777 000 000" /></FormField>
              <FormField label="E-mail"><Input type="email" value={s(company.email)} onChange={(v) => setCompany({ ...company, email: v })} /></FormField>
              <FormField label="Datová schránka"><Input value={s(company.dataBox)} onChange={(v) => setCompany({ ...company, dataBox: v })} /></FormField>
              <FormField label="Číslo účtu"><Input value={s(company.bankAccount)} onChange={(v) => setCompany({ ...company, bankAccount: v })} /></FormField>
              <FormField label="Kód banky"><Input value={s(company.bankCode)} onChange={(v) => setCompany({ ...company, bankCode: v })} placeholder="0800" /></FormField>
              <FormField label="IBAN" span={2}><Input value={s(company.iban)} onChange={(v) => setCompany({ ...company, iban: v })} placeholder="CZ65 0800 ..." /></FormField>
              <FormField label="Plátce DPH">
                <CheckBox checked={!!company.vatPayer} onChange={(v) => setCompany({ ...company, vatPayer: v })} label="Ano, jsme plátci DPH" />
              </FormField>
              {company.vatPayer && (
                <FormField label="Období DPH">
                  <Select value={s(company.vatPeriod)} onChange={(v) => setCompany({ ...company, vatPeriod: v })}>
                    <option value="monthly">Měsíční</option>
                    <option value="quarterly">Čtvrtletní</option>
                  </Select>
                </FormField>
              )}
              <FormField label="Předmět podnikání" span={2}><Input value={s(company.businessActivity)} onChange={(v) => setCompany({ ...company, businessActivity: v })} /></FormField>
              <FormField label="Poznámky" span={2}><Textarea value={s(company.notes)} onChange={(v) => setCompany({ ...company, notes: v })} /></FormField>
            </FormGrid>
            <NextTabBtn onClick={() => setActiveTab("employee")} />
          </div>
        )}

        {/* ── Osobní údaje ── */}
        {activeTab === "employee" && (
          <div className="space-y-5">
            <SectionTitle>2. Osobní, identifikační a kontaktní údaje</SectionTitle>
            <FormGrid>
              <FormField label="Titul"><Input value={s(employee.title)} onChange={(v) => setEmployee({ ...employee, title: v })} placeholder="Ing., Mgr., ..." /></FormField>
              <FormField label="Jméno"><Input value={s(employee.firstName)} onChange={(v) => setEmployee({ ...employee, firstName: v })} /></FormField>
              <FormField label="Příjmení"><Input value={s(employee.lastName)} onChange={(v) => setEmployee({ ...employee, lastName: v })} /></FormField>
              <FormField label="Rodné příjmení"><Input value={s(employee.birthSurname)} onChange={(v) => setEmployee({ ...employee, birthSurname: v })} /></FormField>
              <FormField label="Datum narození"><Input type="date" value={s(employee.birthDate)} onChange={(v) => setEmployee({ ...employee, birthDate: v })} /></FormField>
              <FormField label="Místo narození"><Input value={s(employee.birthPlace)} onChange={(v) => setEmployee({ ...employee, birthPlace: v })} /></FormField>
              <FormField label="Stát narození"><Input value={s(employee.birthCountry)} onChange={(v) => setEmployee({ ...employee, birthCountry: v })} placeholder="CZ / UA / SK ..." /></FormField>
              <FormField label="Národnost"><Input value={s(employee.nationality)} onChange={(v) => setEmployee({ ...employee, nationality: v })} /></FormField>
              <FormField label="Státní občanství"><Input value={s(employee.citizenship)} onChange={(v) => setEmployee({ ...employee, citizenship: v })} /></FormField>
              <FormField label="Rodné číslo"><Input value={s(employee.birthNumber)} onChange={(v) => setEmployee({ ...employee, birthNumber: v })} /></FormField>
              <FormField label="OIČ"><Input value={s(employee.oic)} onChange={(v) => setEmployee({ ...employee, oic: v })} /></FormField>
              <FormField label="Číslo OP / pasu"><Input value={s(employee.idCardNumber)} onChange={(v) => setEmployee({ ...employee, idCardNumber: v })} /></FormField>
              <FormField label="Pohlaví">
                <Select value={s(employee.gender)} onChange={(v) => setEmployee({ ...employee, gender: v })}>
                  <option value="">— vyberte —</option>
                  <option value="M">Muž</option>
                  <option value="F">Žena</option>
                </Select>
              </FormField>
              <FormField label="Vzdělání">
                <Select value={s(employee.education)} onChange={(v) => setEmployee({ ...employee, education: v })}>
                  <option value="">— vyberte —</option>
                  {[["A","Bez vzdělání"],["C","Základní"],["H","Střední s výučním listem"],["M","Střední s maturitou"],["N","Vyšší odborné"],["R","VŠ bakalářské"],["T","VŠ magisterské"],["V","VŠ doktorské"]].map(([k,v]) => (
                    <option key={k} value={k}>{k} — {v}</option>
                  ))}
                </Select>
              </FormField>
            </FormGrid>

            <SubSection title="Trvalá adresa">
              <FormGrid>
                <FormField label="Ulice, č.p." span={2}><Input value={s(employee.permStreet)} onChange={(v) => setEmployee({ ...employee, permStreet: v })} /></FormField>
                <FormField label="Obec"><Input value={s(employee.permCity)} onChange={(v) => setEmployee({ ...employee, permCity: v })} /></FormField>
                <FormField label="PSČ"><Input value={s(employee.permZip)} onChange={(v) => setEmployee({ ...employee, permZip: v })} /></FormField>
                <FormField label="Stát"><Input value={s(employee.permCountry)} onChange={(v) => setEmployee({ ...employee, permCountry: v })} placeholder="CZ" /></FormField>
              </FormGrid>
            </SubSection>

            <SubSection title="Kontaktní údaje">
              <FormGrid>
                <FormField label="Telefon"><Input value={s(employee.phone)} onChange={(v) => setEmployee({ ...employee, phone: v })} /></FormField>
                <FormField label="E-mail"><Input type="email" value={s(employee.email)} onChange={(v) => setEmployee({ ...employee, email: v })} /></FormField>
                <FormField label="Bankovní účet"><Input value={s(employee.bankAccount)} onChange={(v) => setEmployee({ ...employee, bankAccount: v })} /></FormField>
                <FormField label="Kód banky"><Input value={s(employee.bankCode)} onChange={(v) => setEmployee({ ...employee, bankCode: v })} /></FormField>
                <FormField label="Datová schránka"><Input value={s(employee.dataBox)} onChange={(v) => setEmployee({ ...employee, dataBox: v })} /></FormField>
              </FormGrid>
            </SubSection>

            <SubSection title="Cizinec">
              <CheckBox checked={!!employee.isForeigner} onChange={(v) => setEmployee({ ...employee, isForeigner: v })} label="Zaměstnanec je cizinec" />
              {employee.isForeigner && (
                <FormGrid>
                  <FormField label="Typ cizince">
                    <Select value={s(employee.foreignerType)} onChange={(v) => setEmployee({ ...employee, foreignerType: v })}>
                      <option value="EU">Občan EU/EHP/Švýcarsko</option>
                      <option value="ThirdCountry">Cizinec ze třetí země</option>
                    </Select>
                  </FormField>
                  <FormField label="Typ dokladu">
                    <Select value={s(employee.docType)} onChange={(v) => setEmployee({ ...employee, docType: v })}>
                      <option value="Passport">Pas</option>
                      <option value="ID">Občanský průkaz</option>
                      <option value="Other">Jiný</option>
                    </Select>
                  </FormField>
                  <FormField label="Číslo dokladu"><Input value={s(employee.docNumber)} onChange={(v) => setEmployee({ ...employee, docNumber: v })} /></FormField>
                  <FormField label="Stát vydání"><Input value={s(employee.docCountry)} onChange={(v) => setEmployee({ ...employee, docCountry: v })} /></FormField>
                  <FormField label="Platnost dokladu do"><Input type="date" value={s(employee.docValidUntil)} onChange={(v) => setEmployee({ ...employee, docValidUntil: v })} /></FormField>
                  <FormField label="Druh oprávnění"><Input value={s(employee.permitType)} onChange={(v) => setEmployee({ ...employee, permitType: v })} /></FormField>
                  <FormField label="Daňový status">
                    <Select value={s(employee.taxStatus)} onChange={(v) => setEmployee({ ...employee, taxStatus: v })}>
                      <option value="Resident">Rezident</option>
                      <option value="NonResident">Nerezident</option>
                    </Select>
                  </FormField>
                  <FormField label="Adresa v ČR" span={2}><Input value={s(employee.residenceStreet)} onChange={(v) => setEmployee({ ...employee, residenceStreet: v })} /></FormField>
                </FormGrid>
              )}
            </SubSection>
            <NextTabBtn onClick={() => setActiveTab("tax")} />
          </div>
        )}

        {/* ── Daně a rodina ── */}
        {activeTab === "tax" && (
          <div className="space-y-5">
            <SectionTitle>3–5. Daňové, rodinné a pracovní údaje</SectionTitle>
            <FormGrid>
              <FormField label="Roční zúčtování daní" span={2}>
                <CheckBox checked={!!tax.wantsYearlySettlement} onChange={(v) => setTax({ ...tax, wantsYearlySettlement: v })} label="Zaměstnanec žádá o roční zúčtování" />
              </FormField>
              <FormField label="Základní sleva na dani" span={2}>
                <CheckBox checked={!!tax.wantsBasicTaxCredit} onChange={(v) => setTax({ ...tax, wantsBasicTaxCredit: v })} label="Uplatňuje základní slevu na dani" />
              </FormField>
              <FormField label="Rodinný stav">
                <Select value={s(tax.maritalStatus)} onChange={(v) => setTax({ ...tax, maritalStatus: v })}>
                  <option value="single">Svobodný/á</option>
                  <option value="married">Ženatý/Vdaná</option>
                  <option value="divorced">Rozvedený/á</option>
                  <option value="widowed">Ovdovělý/á</option>
                </Select>
              </FormField>
              <FormField label="Místo výkonu práce"><Input value={s(tax.workLocation)} onChange={(v) => setTax({ ...tax, workLocation: v })} /></FormField>
              {tax.maritalStatus === "married" && (<>
                <FormField label="Manžel(ka) – jméno"><Input value={s(tax.spouseName)} onChange={(v) => setTax({ ...tax, spouseName: v })} /></FormField>
                <FormField label="Manžel(ka) – rodné číslo"><Input value={s(tax.spouseBirthNumber)} onChange={(v) => setTax({ ...tax, spouseBirthNumber: v })} /></FormField>
              </>)}
              <FormField label="ZTP/P" span={2}>
                <CheckBox checked={!!tax.isZTPP} onChange={(v) => setTax({ ...tax, isZTPP: v })} label="Držitel průkazu ZTP/P" />
              </FormField>
              <FormField label="Daň. zvýhodnění na děti" span={2}>
                <CheckBox checked={!!tax.hasChildTaxCredit} onChange={(v) => setTax({ ...tax, hasChildTaxCredit: v })} label="Uplatňuje daňové zvýhodnění na děti" />
              </FormField>
              {tax.hasChildTaxCredit && (<>
                <FormField label="Dítě 1 – rodné číslo"><Input value={s(tax.child1BirthNumber)} onChange={(v) => setTax({ ...tax, child1BirthNumber: v })} /></FormField>
                <FormField label="Dítě 2 – rodné číslo"><Input value={s(tax.child2BirthNumber)} onChange={(v) => setTax({ ...tax, child2BirthNumber: v })} /></FormField>
                <FormField label="Dítě 3 – rodné číslo"><Input value={s(tax.child3BirthNumber)} onChange={(v) => setTax({ ...tax, child3BirthNumber: v })} /></FormField>
              </>)}
              <FormField label="Poznámky" span={2}><Textarea value={s(tax.notes)} onChange={(v) => setTax({ ...tax, notes: v })} /></FormField>
            </FormGrid>
            <NextTabBtn onClick={() => setActiveTab("insurance")} />
          </div>
        )}

        {/* ── Pojištění ── */}
        {activeTab === "insurance" && (
          <div className="space-y-5">
            <SectionTitle>6. Zdravotní pojištění a výdělečná činnost</SectionTitle>
            <FormGrid>
              <FormField label="Kód pojišťovny"><Input value={s(insurance.healthInsuranceCode)} onChange={(v) => setInsurance({ ...insurance, healthInsuranceCode: v })} placeholder="111" /></FormField>
              <FormField label="Název pojišťovny"><Input value={s(insurance.healthInsuranceName)} onChange={(v) => setInsurance({ ...insurance, healthInsuranceName: v })} placeholder="VZP ČR" /></FormField>
              <FormField label="Stupeň invalidity">
                <Select value={s(insurance.invalidityDegree)} onChange={(v) => setInsurance({ ...insurance, invalidityDegree: v })}>
                  <option value="">Žádný</option>
                  <option value="I">I. stupeň</option>
                  <option value="II">II. stupeň</option>
                  <option value="III">III. stupeň</option>
                </Select>
              </FormField>
            </FormGrid>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ["otherEmployment", "Další výdělečná činnost"],
                ["wageDeductions", "Exekuce / srážky ze mzdy"],
                ["isPensioner", "Poživatel důchodu"],
                ["isStudent", "Student"],
                ["maternityBenefit", "Peněžitá pomoc v mateřství"],
                ["parentalBenefit", "Rodičovský příspěvek"],
                ["isJobSeeker", "Uchazeč o zaměstnání"],
                ["isCaregiving", "Péče o bezmocnou osobu"],
                ["isChildcareUnder7", "Péče o dítě do 7 let"],
                ["anotherEmployerWithInsurance", "Jiný zaměstnavatel (pojištění)"],
                ["isSelfEmployedMinBase", "OSVČ – zálohy ZP z min. základu"],
              ] as [string, string][]).map(([key, label]) => (
                <CheckBox key={key} checked={!!insurance[key]} onChange={(v) => setInsurance({ ...insurance, [key]: v })} label={label} />
              ))}
            </div>
            {insurance.isPensioner && (
              <FormField label="Typ důchodu"><Input value={s(insurance.pensionType)} onChange={(v) => setInsurance({ ...insurance, pensionType: v })} /></FormField>
            )}
            {insurance.anotherEmployerWithInsurance && (
              <FormField label="Název jiného zaměstnavatele"><Input value={s(insurance.anotherEmployerName)} onChange={(v) => setInsurance({ ...insurance, anotherEmployerName: v })} /></FormField>
            )}
            <FormField label="Poznámky"><Textarea value={s(insurance.notes)} onChange={(v) => setInsurance({ ...insurance, notes: v })} /></FormField>
          </div>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Ukládám..." : mode === "new" ? "Vytvořit klienta" : "Uložit změny"}
      </button>
    </div>
  );
}

// ─── Helper: convert any to string ───────────────────────────────────────────
function s(v: string | boolean | undefined): string {
  if (v === undefined || v === null || typeof v === "boolean") return "";
  return String(v);
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold text-foreground border-b border-border pb-3 text-sm">{children}</h2>;
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-4">{children}</div>;
}

function FormField({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={cn(span === 2 ? "col-span-2" : "col-span-1")}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
    />
  );
}

function Select({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
    >
      {children}
    </select>
  );
}

function Textarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
    />
  );
}

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
          checked ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
        )}
      >
        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function NextTabBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-primary hover:underline ml-auto">
      Další sekce <ChevronRight className="w-4 h-4" />
    </button>
  );
}
