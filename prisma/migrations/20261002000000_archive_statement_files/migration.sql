-- Архів документів і файли виписок
ALTER TABLE "Document" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "BankStatement" ADD COLUMN "fileUrl" TEXT;
