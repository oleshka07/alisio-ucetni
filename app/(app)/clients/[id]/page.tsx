import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import {
  formatDate,
  formatCurrency,
  educationLabel,
  statusLabel,
  priorityLabel,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Building2,
  User,
  ExternalLink,
  FileText,
  Clock,
  Edit,
} from "lucide-react";
import DeleteClientButton from "@/components/DeleteClientButton";

export default async function ClientPage({
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
      tasks: {
        where: { status: { in: ["pending", "in_progress"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      taxEvents: {
        where: { status: { in: ["upcoming", "overdue"] } },
        orderBy: { dueDate: "asc" },
        take: 5,
      },
    },
  });

  if (!client) notFound();

  const cp = client.companyProfile;
  const ep = client.employeeProfile;
  const tp = client.taxProfile;
  const ip = client.insuranceProfile;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: client.color + "20" }}
          >
            {client.type === "company" ? (
              <Building2 className="w-6 h-6" style={{ color: client.color }} />
            ) : (
              <User className="w-6 h-6" style={{ color: client.color }} />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{client.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {client.type === "company" ? "Společnost" : "Fyzická osoba"} ·{" "}
              {client.role === "owner" ? "Majitel" : client.role === "director" ? "Ředitel/ka" : "Zaměstnanec"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clients/${client.id}/accountant`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Pohled účetní
          </Link>
          <Link
            href={`/clients/${client.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
            Upravit
          </Link>
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Company Info */}
          {cp && (
            <Section title="Identifikace zaměstnavatele / společnosti">
              <Grid>
                <Field label="Název" value={cp.companyName} />
                <Field label="IČO" value={cp.ico} mono />
                <Field label="DIČ / IČ DPH" value={cp.dic} mono />
                <Field label="Právní forma" value={cp.legalForm} />
                <Field label="Datum registrace" value={cp.registrationDate} />
                <Field label="Plátce DPH" value={cp.vatPayer ? "Ano" : "Ne"} />
                {cp.vatPayer && <Field label="Období DPH" value={cp.vatPeriod === "quarterly" ? "Čtvrtletní" : "Měsíční"} />}
                <Field label="Ulice, č.p." value={cp.street} />
                <Field label="Obec, PSČ" value={cp.city && cp.zip ? `${cp.city}, ${cp.zip}` : cp.city ?? cp.zip} />
                <Field label="Stát" value={cp.country} />
                <Field label="Kontaktní osoba" value={cp.contactPerson} />
                <Field label="Telefon" value={cp.phone} />
                <Field label="E-mail" value={cp.email} />
                <Field label="Datová schránka" value={cp.dataBox} mono />
                <Field label="Bankovní účet" value={cp.bankAccount && cp.bankCode ? `${cp.bankAccount}/${cp.bankCode}` : cp.bankAccount} mono />
                <Field label="IBAN" value={cp.iban} mono />
                <Field label="Předmět podnikání" value={cp.businessActivity} span={2} />
              </Grid>
            </Section>
          )}

          {/* Employee / Personal Info */}
          {ep && (
            <>
              <Section title="2. Osobní, identifikační a kontaktní údaje">
                <Grid>
                  <Field label="Titul, jméno a příjmení" value={[ep.title, ep.firstName, ep.lastName].filter(Boolean).join(" ")} />
                  <Field label="Rodné příjmení" value={ep.birthSurname} />
                  <Field label="Datum narození" value={ep.birthDate} />
                  <Field label="Místo narození" value={ep.birthPlace} />
                  <Field label="Stát narození" value={ep.birthCountry} />
                  <Field label="Národnost" value={ep.nationality} />
                  <Field label="Státní občanství" value={ep.citizenship} />
                  <Field label="Rodné číslo" value={ep.birthNumber} mono sensitive />
                  <Field label="OIČ" value={ep.oic} mono sensitive />
                  <Field label="Číslo OP/pasu" value={ep.idCardNumber} mono sensitive />
                  <Field label="Pohlaví" value={ep.gender === "M" ? "Muž" : ep.gender === "F" ? "Žena" : undefined} />
                </Grid>
                <Subheading>Trvalá adresa</Subheading>
                <Grid>
                  <Field label="Ulice, číslo" value={ep.permStreet} />
                  <Field label="Obec, PSČ" value={ep.permCity && ep.permZip ? `${ep.permCity}, ${ep.permZip}` : ep.permCity ?? ep.permZip} />
                  <Field label="Stát" value={ep.permCountry} />
                </Grid>
                {(ep.tempStreet || ep.tempCity) && (
                  <>
                    <Subheading>Přechodná adresa</Subheading>
                    <Grid>
                      <Field label="Ulice, číslo" value={ep.tempStreet} />
                      <Field label="Obec, PSČ" value={ep.tempCity && ep.tempZip ? `${ep.tempCity}, ${ep.tempZip}` : ep.tempCity ?? ep.tempZip} />
                      <Field label="Stát" value={ep.tempCountry} />
                    </Grid>
                  </>
                )}
                <Subheading>Kontaktní údaje</Subheading>
                <Grid>
                  <Field label="Telefon" value={ep.phone} />
                  <Field label="E-mail" value={ep.email} />
                  <Field label="Bankovní účet" value={ep.bankAccount} mono />
                  <Field label="Datová schránka" value={ep.dataBox} mono />
                </Grid>
              </Section>

              {/* Foreigner section */}
              {ep.isForeigner && (
                <Section title="7. Údaje pro cizince">
                  <Grid>
                    <Field label="Typ cizince" value={ep.foreignerType === "EU" ? "Občan EU/EHP/Švýcarsko" : "Cizinec ze třetí země"} />
                    <Field label="Důvod volného přístupu" value={ep.freeAccessReason} />
                    <Field label="Druh oprávnění" value={ep.permitType} />
                    <Field label="Typ dokladu" value={ep.docType} />
                    <Field label="Číslo dokladu" value={ep.docNumber} mono />
                    <Field label="Stát vydání" value={ep.docCountry} />
                    <Field label="Platnost dokladu" value={ep.docValidUntil} />
                    <Field label="Č. potvrzení pobytu" value={ep.residenceConfirmNumber} mono />
                    <Field label="Adresa v ČR" value={[ep.residenceStreet, ep.residenceCity, ep.residenceZip].filter(Boolean).join(", ")} />
                    <Field label="České rodné číslo" value={ep.hasCzBirthNumber ? "Ano" : "Ne"} />
                    <Field label="Daňový status" value={ep.taxStatus} />
                    <Field label="ZP — pojišťovna" value={ep.healthInsuranceName} />
                    <Field label="Č. ZP" value={ep.healthInsuranceNumber} mono />
                    <Field label="Karta pojištěnce" value={ep.hasInsuranceCard ? "Ano" : "Ne"} />
                    <Field label="Č. SP" value={ep.socialInsuranceNumber} mono />
                  </Grid>
                </Section>
              )}
            </>
          )}

          {/* Tax & Insurance */}
          {tp && (
            <Section title="3. Daňové a pojistné údaje">
              <Grid>
                <Field label="Roční zúčtování daní" value={tp.wantsYearlySettlement ? "Ano" : "Ne"} />
                <Field label="Sleva na dani (základní)" value={tp.wantsBasicTaxCredit ? "Ano" : "Ne"} />
                <Field label="Nejvyšší dosažené vzdělání" value={ep ? educationLabel(ep.education) : undefined} />
                <Field label="Rodinný stav" value={tp.maritalStatus === "married" ? "Ženatý/Vdaná" : tp.maritalStatus === "single" ? "Svobodný/á" : tp.maritalStatus === "divorced" ? "Rozvedený/á" : tp.maritalStatus} />
                {tp.spouseName && <Field label="Manžel(ka) — jméno" value={tp.spouseName} />}
                {tp.spouseBirthNumber && <Field label="Manžel(ka) — rodné číslo" value={tp.spouseBirthNumber} mono sensitive />}
                <Field label="ZTP/P" value={tp.isZTPP ? "Ano" : "Ne"} />
                <Field label="Daň. zvýhodnění na děti" value={tp.hasChildTaxCredit ? "Ano" : "Ne"} />
                {tp.child1BirthNumber && <Field label="Dítě 1 — RČ" value={tp.child1BirthNumber} mono sensitive />}
                {tp.child2BirthNumber && <Field label="Dítě 2 — RČ" value={tp.child2BirthNumber} mono sensitive />}
                {tp.child3BirthNumber && <Field label="Dítě 3 — RČ" value={tp.child3BirthNumber} mono sensitive />}
                <Field label="Místo výkonu práce" value={tp.workLocation} />
              </Grid>
            </Section>
          )}

          {/* Insurance */}
          {ip && (
            <Section title="6. Zdravotní pojištění a další výdělečná činnost">
              <Grid>
                <Field label="Zdravotní pojišťovna" value={`${ip.healthInsuranceCode ?? ""} ${ip.healthInsuranceName ?? ""}`.trim()} />
                <Field label="Stupeň invalidity" value={ip.invalidityDegree} />
                <Field label="Exekuce/srážky ze mzdy" value={ip.wageDeductions ? "Ano" : "Ne"} />
                <Field label="Další zaměstnání" value={ip.otherEmployment ? "Ano" : "Ne"} />
                <Field label="Důchodce" value={ip.isPensioner ? "Ano" : "Ne"} />
                {ip.pensionType && <Field label="Typ důchodu" value={ip.pensionType} />}
                <Field label="Student" value={ip.isStudent ? "Ano" : "Ne"} />
                <Field label="Mateřská / PPM" value={ip.maternityBenefit ? "Ano" : "Ne"} />
                <Field label="Rodičovský příspěvek" value={ip.parentalBenefit ? "Ano" : "Ne"} />
                <Field label="Uchazeč o zaměstnání" value={ip.isJobSeeker ? "Ano" : "Ne"} />
                <Field label="Péče o bezmocnou osobu" value={ip.isCaregiving ? "Ano" : "Ne"} />
                <Field label="Celodenní péče (dítě do 7 let)" value={ip.isChildcareUnder7 ? "Ano" : "Ne"} />
                <Field label="OSVČ — min. zálohy ZP" value={ip.isSelfEmployedMinBase ? "Ano" : "Ne"} />
                {ip.anotherEmployerName && <Field label="Jiný zaměstnavatel (pojištění)" value={ip.anotherEmployerName} span={2} />}
              </Grid>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Upcoming taxes */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-foreground">Daňové povinnosti</h3>
              <Link href="/calendar" className="text-xs text-primary hover:underline">Vše</Link>
            </div>
            {client.taxEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Žádné nadcházející události</p>
            ) : (
              <div className="space-y-2">
                {client.taxEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(ev.dueDate)}</p>
                    </div>
                    {ev.amount && (
                      <span className="text-xs font-semibold text-foreground shrink-0">
                        {formatCurrency(ev.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-foreground">Aktivní úkoly</h3>
              <Link href="/tasks" className="text-xs text-primary hover:underline">Vše</Link>
            </div>
            {client.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Žádné aktivní úkoly</p>
            ) : (
              <div className="space-y-2">
                {client.tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent block"
                  >
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                      task.priority === "high" ? "bg-red-500" : task.priority === "normal" ? "bg-amber-500" : "bg-gray-300"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(task.dueDate)}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium shrink-0",
                      task.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {statusLabel(task.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-foreground">Dokumenty</h3>
              <Link href={`/documents?clientId=${client.id}`} className="text-xs text-primary hover:underline">Vše</Link>
            </div>
            {client.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Žádné dokumenty</p>
            ) : (
              <div className="space-y-2">
                {client.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{doc.originalName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-semibold text-foreground mb-4 pb-3 border-b border-border text-sm">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
      {children}
    </h3>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
  );
}

function Field({
  label,
  value,
  mono,
  sensitive,
  span,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  sensitive?: boolean;
  span?: number;
}) {
  if (!value) return null;
  return (
    <div className={cn(span === 2 ? "col-span-2" : "")}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm text-foreground", mono && "font-mono")}>
        {sensitive ? "••••••••" : value}
      </p>
    </div>
  );
}
