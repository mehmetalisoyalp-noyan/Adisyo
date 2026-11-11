-- CreateTable
CREATE TABLE "AdisyoAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdisyoAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdisyoConnection" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "apiSecretEnc" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startFrom" TIMESTAMP(3) NOT NULL,
    "cursor" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdisyoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdisyoOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "orderType" TEXT,
    "channel" TEXT,
    "status" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "total" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payments" JSONB,

    CONSTRAINT "AdisyoOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdisyoOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT,
    "parentId" TEXT,
    "isMenu" BOOLEAN NOT NULL DEFAULT false,
    "productCode" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,

    CONSTRAINT "AdisyoOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdisyoAccount_organizationId_key" ON "AdisyoAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AdisyoConnection_branchId_key" ON "AdisyoConnection"("branchId");

-- CreateIndex
CREATE INDEX "AdisyoOrder_branchId_orderDate_idx" ON "AdisyoOrder"("branchId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdisyoOrder_branchId_externalId_key" ON "AdisyoOrder"("branchId", "externalId");

-- CreateIndex
CREATE INDEX "AdisyoOrderLine_orderId_idx" ON "AdisyoOrderLine"("orderId");

-- AddForeignKey
ALTER TABLE "AdisyoAccount" ADD CONSTRAINT "AdisyoAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdisyoConnection" ADD CONSTRAINT "AdisyoConnection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdisyoOrder" ADD CONSTRAINT "AdisyoOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdisyoOrder" ADD CONSTRAINT "AdisyoOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdisyoOrderLine" ADD CONSTRAINT "AdisyoOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdisyoOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

