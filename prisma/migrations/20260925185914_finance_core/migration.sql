-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "aiStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "docType" TEXT,
ADD COLUMN     "extracted" JSONB,
ADD COLUMN     "extractedAmount" DECIMAL(14,2),
ADD COLUMN     "extractedCounterparty" TEXT,
ADD COLUMN     "extractedCurrency" TEXT,
ADD COLUMN     "extractedDate" TIMESTAMP(3),
ADD COLUMN     "extractedIco" TEXT,
ADD COLUMN     "extractedNumber" TEXT,
ADD COLUMN     "extractedVs" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "source" TEXT,
ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "telegramChatId" TEXT,
    "tgAwaitingTxId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'imap_camt',
    "imapHost" TEXT,
    "imapPort" INTEGER DEFAULT 993,
    "imapUser" TEXT,
    "imapPasswordEnc" TEXT,
    "imapFolder" TEXT DEFAULT 'INBOX',
    "senderFilter" TEXT,
    "lastUid" INTEGER,
    "fioTokenEnc" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fileName" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "openingBalance" DECIMAL(14,2),
    "closingBalance" DECIMAL(14,2),
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "statementId" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "variableSymbol" TEXT,
    "constantSymbol" TEXT,
    "specificSymbol" TEXT,
    "message" TEXT,
    "externalId" TEXT,
    "dedupHash" TEXT NOT NULL,
    "category" TEXT,
    "requiredDocs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "docHint" TEXT,
    "docStatus" TEXT NOT NULL DEFAULT 'missing',
    "docStatusManual" BOOLEAN NOT NULL DEFAULT false,
    "ruleId" TEXT,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDocument" (
    "transactionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "linkedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionDocument_pkey" PRIMARY KEY ("transactionId","documentId")
);

-- CreateTable
CREATE TABLE "DocRequirementRule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "direction" TEXT NOT NULL DEFAULT 'any',
    "counterpartyContains" TEXT,
    "accountContains" TEXT,
    "messageContains" TEXT,
    "minAbsAmount" DECIMAL(14,2),
    "maxAbsAmount" DECIMAL(14,2),
    "category" TEXT,
    "requiredDocs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notNeeded" BOOLEAN NOT NULL DEFAULT false,
    "hint" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocRequirementRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "transactionId" TEXT,
    "requestedById" TEXT,
    "docType" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fulfilledById" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "remindCount" INTEGER NOT NULL DEFAULT 0,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentInbox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'documents',
    "clientId" TEXT,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapUser" TEXT NOT NULL,
    "imapPasswordEnc" TEXT NOT NULL,
    "imapFolder" TEXT NOT NULL DEFAULT 'INBOX',
    "senderFilter" TEXT,
    "lastUid" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "text" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataBoxMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "dataBoxId" TEXT,
    "dataBoxName" TEXT,
    "clientId" TEXT,
    "sender" TEXT,
    "subject" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "fictionAt" TIMESTAMP(3),
    "emailSubject" TEXT,
    "rawText" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataBoxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_bankAccountId_externalId_key" ON "BankStatement"("bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "Transaction_clientId_bookingDate_idx" ON "Transaction"("clientId", "bookingDate");

-- CreateIndex
CREATE INDEX "Transaction_docStatus_idx" ON "Transaction"("docStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_clientId_dedupHash_key" ON "Transaction"("clientId", "dedupHash");

-- CreateIndex
CREATE INDEX "TransactionDocument_documentId_idx" ON "TransactionDocument"("documentId");

-- CreateIndex
CREATE INDEX "DocumentRequest_status_idx" ON "DocumentRequest"("status");

-- CreateIndex
CREATE INDEX "NotificationLog_kind_refId_idx" ON "NotificationLog"("kind", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "DataBoxMessage_messageId_key" ON "DataBoxMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DataBoxMessage_taskId_key" ON "DataBoxMessage"("taskId");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_clientId_createdAt_idx" ON "Document"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDocument" ADD CONSTRAINT "TransactionDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDocument" ADD CONSTRAINT "TransactionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocRequirementRule" ADD CONSTRAINT "DocRequirementRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_fulfilledById_fkey" FOREIGN KEY ("fulfilledById") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataBoxMessage" ADD CONSTRAINT "DataBoxMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing documents were uploaded before AI processing existed
UPDATE "Document" SET "aiStatus" = 'skipped';
