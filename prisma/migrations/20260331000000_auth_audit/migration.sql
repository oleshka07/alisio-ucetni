-- AlterTable: Add access code fields to Client
ALTER TABLE "Client" ADD COLUMN "accessCode" TEXT;
ALTER TABLE "Client" ADD COLUMN "accessCodeCreatedAt" TIMESTAMP(3);

-- CreateIndex: Unique index on accessCode
CREATE UNIQUE INDEX "Client_accessCode_key" ON "Client"("accessCode");

-- CreateTable: AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "section" TEXT,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
