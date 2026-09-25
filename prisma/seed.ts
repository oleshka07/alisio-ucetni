import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Сід СТИРАЄ всі дані — лише для локальної розробки
  if (process.env.ALLOW_SEED !== "1" || process.env.NODE_ENV === "production") {
    console.error("Seed disabled. It deletes ALL data. Run with ALLOW_SEED=1 on a local dev database only.");
    process.exit(1);
  }
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.taxEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.document.deleteMany();
  await prisma.insuranceProfile.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.client.deleteMany();
  await prisma.apiIntegration.deleteMany();

  // ─── Клієнт 1: Головна компанія (власник) ──────────────────────────────────
  const company1 = await prisma.client.create({
    data: {
      name: "Hlavní společnost s.r.o.",
      type: "company",
      role: "owner",
      color: "#6366f1",
      companyProfile: {
        create: {
          companyName: "Hlavní společnost s.r.o.",
          ico: "12345678",
          dic: "CZ12345678",
          street: "Václavské náměstí 1",
          city: "Praha 1",
          zip: "110 00",
          country: "CZ",
          contactPerson: "Степан",
          phone: "+420 777 000 001",
          email: "info@hlavni-spolecnost.cz",
          dataBox: "abc1234",
          bankAccount: "123456789",
          bankCode: "0800",
          iban: "CZ65 0800 0000 0012 3456 7890",
          vatPayer: true,
          vatPeriod: "quarterly",
          registrationDate: "2020-01-15",
          legalForm: "s.r.o.",
          businessActivity: "Konzultační a poradenská činnost",
        },
      },
      taxProfile: {
        create: {
          wantsYearlySettlement: true,
          wantsBasicTaxCredit: true,
          maritalStatus: "married",
          hasChildTaxCredit: true,
          workLocation: "Praha 1",
        },
      },
    },
  });

  // ─── Клієнт 2: Директорка (дружина) ────────────────────────────────────────
  const director = await prisma.client.create({
    data: {
      name: "Олена — директор",
      type: "person",
      role: "director",
      color: "#ec4899",
      companyProfile: {
        create: {
          companyName: "Hlavní společnost s.r.o.",
          ico: "12345678",
          dic: "CZ12345678",
          street: "Václavské náměstí 1",
          city: "Praha 1",
          zip: "110 00",
          country: "CZ",
          contactPerson: "Олена",
          phone: "+420 777 000 002",
          email: "olena@hlavni-spolecnost.cz",
        },
      },
      employeeProfile: {
        create: {
          title: "Ing.",
          firstName: "Олена",
          lastName: "Прізвище",
          birthDate: "1985-06-15",
          birthPlace: "Kyiv",
          birthCountry: "UA",
          nationality: "UA",
          citizenship: "UA",
          gender: "F",
          permStreet: "Václavské náměstí 1",
          permCity: "Praha 1",
          permZip: "110 00",
          permCountry: "CZ",
          phone: "+420 777 000 002",
          email: "olena@hlavni-spolecnost.cz",
          isForeigner: true,
          foreignerType: "ThirdCountry",
          taxStatus: "Resident",
          education: "T",
        },
      },
      taxProfile: {
        create: {
          wantsYearlySettlement: true,
          wantsBasicTaxCredit: true,
          maritalStatus: "married",
          workLocation: "Praha 1",
        },
      },
      insuranceProfile: {
        create: {
          healthInsuranceCode: "111",
          healthInsuranceName: "VZP ČR",
          otherEmployment: false,
          isPensioner: false,
          isStudent: false,
        },
      },
    },
  });

  // ─── Клієнт 3: Друга компанія ───────────────────────────────────────────────
  const company2 = await prisma.client.create({
    data: {
      name: "Druhá firma s.r.o.",
      type: "company",
      role: "owner",
      color: "#10b981",
      companyProfile: {
        create: {
          companyName: "Druhá firma s.r.o.",
          ico: "87654321",
          dic: "CZ87654321",
          street: "Náměstí Míru 5",
          city: "Praha 2",
          zip: "120 00",
          country: "CZ",
          contactPerson: "Степан",
          phone: "+420 777 000 003",
          email: "info@druha-firma.cz",
          dataBox: "xyz5678",
          bankAccount: "987654321",
          bankCode: "2700",
          iban: "CZ65 2700 0000 0098 7654 3210",
          vatPayer: false,
          registrationDate: "2022-03-10",
          legalForm: "s.r.o.",
          businessActivity: "Obchodní činnost",
        },
      },
      taxProfile: {
        create: {
          wantsYearlySettlement: true,
          wantsBasicTaxCredit: false,
          workLocation: "Praha 2",
        },
      },
    },
  });

  // ─── Податкові події 2025 ────────────────────────────────────────────────────
  const taxEvents = [
    {
      clientId: company1.id,
      title: "DPH za Q1 2025",
      description: "Čtvrtletní přiznání k DPH",
      eventType: "tax_payment",
      dueDate: new Date("2025-04-25"),
      amount: 45000,
      currency: "CZK",
      status: "paid",
      period: "2025-Q1",
    },
    {
      clientId: company1.id,
      title: "DPH za Q2 2025",
      description: "Čtvrtletní přiznání k DPH",
      eventType: "tax_payment",
      dueDate: new Date("2025-07-25"),
      amount: 52000,
      currency: "CZK",
      status: "paid",
      period: "2025-Q2",
    },
    {
      clientId: company1.id,
      title: "DPH za Q3 2025",
      description: "Čtvrtletní přiznání k DPH",
      eventType: "tax_payment",
      dueDate: new Date("2025-10-25"),
      amount: 48000,
      currency: "CZK",
      status: "upcoming",
      period: "2025-Q3",
    },
    {
      clientId: company1.id,
      title: "DPH za Q4 2025",
      description: "Čtvrtletní přiznání k DPH",
      eventType: "tax_payment",
      dueDate: new Date("2026-01-25"),
      amount: 50000,
      currency: "CZK",
      status: "upcoming",
      isPredicted: true,
      period: "2025-Q4",
    },
    {
      clientId: company1.id,
      title: "Daň z příjmů PO 2025",
      description: "Roční daňové přiznání právnické osoby",
      eventType: "report",
      dueDate: new Date("2026-04-01"),
      amount: 120000,
      currency: "CZK",
      status: "upcoming",
      isPredicted: true,
      period: "2025",
    },
    {
      clientId: company1.id,
      title: "Záloha na daň z příjmů",
      description: "Pololetní záloha",
      eventType: "tax_payment",
      dueDate: new Date("2025-12-15"),
      amount: 30000,
      currency: "CZK",
      status: "upcoming",
      period: "2025-H2",
    },
    {
      clientId: company2.id,
      title: "Přiznání k dani z příjmů 2025",
      description: "Roční daňové přiznání — Druhá firma",
      eventType: "report",
      dueDate: new Date("2026-04-01"),
      amount: 18000,
      currency: "CZK",
      status: "upcoming",
      isPredicted: true,
      period: "2025",
    },
    {
      clientId: director.id,
      title: "Přiznání DPFO 2025 — Олена",
      description: "Daňové přiznání fyzické osoby (direktora)",
      eventType: "report",
      dueDate: new Date("2026-04-01"),
      amount: 15000,
      currency: "CZK",
      status: "upcoming",
      isPredicted: true,
      period: "2025",
    },
  ];

  for (const event of taxEvents) {
    await prisma.taxEvent.create({ data: event });
  }

  // ─── Vzorové úkoly ────────────────────────────────────────────────────────────
  await prisma.task.create({
    data: {
      clientId: company1.id,
      title: "Dodat podklady pro DPH Q3",
      description: "Prosím zašlete faktury přijaté a vydané za Q3 2025",
      status: "pending",
      priority: "high",
      dueDate: new Date("2025-10-15"),
      createdBy: "accountant",
    },
  });

  await prisma.task.create({
    data: {
      clientId: company1.id,
      title: "Podpis plné moci",
      description: "Nutno podepsat plnou moc pro zastupování na FÚ",
      status: "in_progress",
      priority: "high",
      dueDate: new Date("2025-10-01"),
      createdBy: "accountant",
    },
  });

  await prisma.task.create({
    data: {
      clientId: director.id,
      title: "Zaslat potvrzení o příjmech",
      description: "Potvrzení zaměstnavatele o zdanitelných příjmech za 2024",
      status: "done",
      priority: "normal",
      createdBy: "accountant",
    },
  });

  // ─── API integrace ─────────────────────────────────────────────────────────
  await prisma.apiIntegration.createMany({
    data: [
      { name: "fakturoid", displayName: "Fakturoid", isActive: false },
      { name: "pohoda", displayName: "POHODA", isActive: false },
      { name: "ares", displayName: "ARES (OR)", isActive: false },
      { name: "moje_id", displayName: "mojeID / ePortál", isActive: false },
      { name: "csob", displayName: "ČSOB Banking API", isActive: false },
      { name: "kb", displayName: "Komerční banka API", isActive: false },
    ],
  });

  console.log("✅ Seed complete!");
  console.log(`   Clients: ${await prisma.client.count()}`);
  console.log(`   Tax events: ${await prisma.taxEvent.count()}`);
  console.log(`   Tasks: ${await prisma.task.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
