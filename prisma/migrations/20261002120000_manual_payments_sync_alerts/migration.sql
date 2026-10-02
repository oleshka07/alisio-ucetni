-- Платежі мимо банку (готівка, приватна картка) і лічильник збоїв синхронізації
ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "failCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocumentInbox" ADD COLUMN "failCount" INTEGER NOT NULL DEFAULT 0;
