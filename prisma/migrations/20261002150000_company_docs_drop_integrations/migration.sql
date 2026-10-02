-- Документи фірми (виписка з OR, статут, ліцензії…) і прибрані «Integrace»
ALTER TABLE "Document" ADD COLUMN "companyDoc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "docCategory" TEXT;
ALTER TABLE "Document" ADD COLUMN "validUntil" TIMESTAMP(3);
DROP TABLE IF EXISTS "ApiIntegration";
