-- AlterTable
ALTER TABLE "DataBoxMessage" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "attachments" INTEGER,
ADD COLUMN     "downloadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataBoxAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "dataBoxId" TEXT,
    "ownerName" TEXT,
    "passwordExpiresAt" TIMESTAMP(3),
    "passwordCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataBoxAccount_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DataBoxMessage" ADD CONSTRAINT "DataBoxMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DataBoxAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataBoxAccount" ADD CONSTRAINT "DataBoxAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

