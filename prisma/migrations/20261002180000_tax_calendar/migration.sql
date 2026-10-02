-- Automatický daňový kalendář: nastavení firmy + termíny
ALTER TABLE "CompanyProfile" ADD COLUMN "taxCalendar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompanyProfile" ADD COLUMN "taxEntity" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "euSupplies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "hasEmployees" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "hasWithholding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "incomeTaxFiling" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "CompanyProfile" ADD COLUMN "incomeTaxAdvances" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "CompanyProfile" ADD COLUMN "flatTax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "roadTaxVehicles" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "ownsRealEstate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyProfile" ADD COLUMN "propertyTaxSplit" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TaxEvent" ADD COLUMN "key" TEXT;
ALTER TABLE "TaxEvent" ADD COLUMN "kind" TEXT;
ALTER TABLE "TaxEvent" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "TaxEvent" ADD COLUMN "files" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaxEvent" ADD COLUMN "pays" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaxEvent" ADD COLUMN "accountPrefix" TEXT;
ALTER TABLE "TaxEvent" ADD COLUMN "note" TEXT;
ALTER TABLE "TaxEvent" ADD COLUMN "doneAt" TIMESTAMP(3);
ALTER TABLE "TaxEvent" ADD COLUMN "paidTransactionId" TEXT;
ALTER TABLE "TaxEvent" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "TaxEvent_clientId_key_key" ON "TaxEvent"("clientId", "key");
CREATE INDEX "TaxEvent_dueDate_idx" ON "TaxEvent"("dueDate");
