-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "companyName" TEXT,
    "ico" TEXT,
    "dic" TEXT,
    "street" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'CZ',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "dataBox" TEXT,
    "bankAccount" TEXT,
    "bankCode" TEXT,
    "iban" TEXT,
    "vatPayer" BOOLEAN NOT NULL DEFAULT false,
    "vatPeriod" TEXT,
    "registrationDate" TEXT,
    "legalForm" TEXT,
    "businessActivity" TEXT,
    "notes" TEXT,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthSurname" TEXT,
    "birthDate" TEXT,
    "birthPlace" TEXT,
    "birthCountry" TEXT,
    "nationality" TEXT,
    "citizenship" TEXT,
    "birthNumber" TEXT,
    "oic" TEXT,
    "idCardNumber" TEXT,
    "gender" TEXT,
    "permStreet" TEXT,
    "permCity" TEXT,
    "permZip" TEXT,
    "permCountry" TEXT,
    "tempStreet" TEXT,
    "tempCity" TEXT,
    "tempZip" TEXT,
    "tempCountry" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankAccount" TEXT,
    "bankCode" TEXT,
    "iban" TEXT,
    "dataBox" TEXT,
    "education" TEXT,
    "isForeigner" BOOLEAN NOT NULL DEFAULT false,
    "foreignerType" TEXT,
    "freeAccessReason" TEXT,
    "permitType" TEXT,
    "docType" TEXT,
    "docNumber" TEXT,
    "docCountry" TEXT,
    "docValidUntil" TEXT,
    "residenceConfirmNumber" TEXT,
    "residenceStreet" TEXT,
    "residenceCity" TEXT,
    "residenceZip" TEXT,
    "hasCzBirthNumber" BOOLEAN NOT NULL DEFAULT true,
    "healthInsuranceName" TEXT,
    "healthInsuranceNumber" TEXT,
    "hasInsuranceCard" BOOLEAN NOT NULL DEFAULT true,
    "socialInsuranceNumber" TEXT,
    "taxStatus" TEXT,
    "notes" TEXT,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "wantsYearlySettlement" BOOLEAN NOT NULL DEFAULT true,
    "wantsBasicTaxCredit" BOOLEAN NOT NULL DEFAULT true,
    "maritalStatus" TEXT,
    "spouseName" TEXT,
    "spouseBirthNumber" TEXT,
    "isZTPP" BOOLEAN NOT NULL DEFAULT false,
    "child1BirthNumber" TEXT,
    "child2BirthNumber" TEXT,
    "child3BirthNumber" TEXT,
    "hasChildTaxCredit" BOOLEAN NOT NULL DEFAULT false,
    "workLocation" TEXT,
    "notes" TEXT,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "healthInsuranceCode" TEXT,
    "healthInsuranceName" TEXT,
    "invalidityDegree" TEXT,
    "otherEmployment" BOOLEAN NOT NULL DEFAULT false,
    "wageDeductions" BOOLEAN NOT NULL DEFAULT false,
    "isPensioner" BOOLEAN NOT NULL DEFAULT false,
    "pensionType" TEXT,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "maternityBenefit" BOOLEAN NOT NULL DEFAULT false,
    "parentalBenefit" BOOLEAN NOT NULL DEFAULT false,
    "isJobSeeker" BOOLEAN NOT NULL DEFAULT false,
    "isCaregiving" BOOLEAN NOT NULL DEFAULT false,
    "isChildcareUnder7" BOOLEAN NOT NULL DEFAULT false,
    "anotherEmployerWithInsurance" BOOLEAN NOT NULL DEFAULT false,
    "anotherEmployerName" TEXT,
    "isSelfEmployedMinBase" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "InsuranceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'accountant',
    "notes" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "isPredicted" BOOLEAN NOT NULL DEFAULT false,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiIntegration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT,
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_clientId_key" ON "CompanyProfile"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_clientId_key" ON "EmployeeProfile"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_clientId_key" ON "TaxProfile"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProfile_clientId_key" ON "InsuranceProfile"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_documentId_key" ON "Task"("documentId");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceProfile" ADD CONSTRAINT "InsuranceProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxEvent" ADD CONSTRAINT "TaxEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
