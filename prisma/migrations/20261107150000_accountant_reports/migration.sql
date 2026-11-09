-- CreateTable
CREATE TABLE "AccountantReport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 10,
    "senderInboxId" TEXT,
    "attachZip" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentMonth" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountantReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AccountantReport" ADD CONSTRAINT "AccountantReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantReport" ADD CONSTRAINT "AccountantReport_senderInboxId_fkey" FOREIGN KEY ("senderInboxId") REFERENCES "DocumentInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

