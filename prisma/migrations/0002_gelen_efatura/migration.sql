-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EDocStatus" ADD VALUE 'PROCESSED';
ALTER TYPE "EDocStatus" ADD VALUE 'IGNORED';

-- DropForeignKey
ALTER TABLE "PurchaseLine" DROP CONSTRAINT "PurchaseLine_stockItemId_fkey";

-- AlterTable
ALTER TABLE "PurchaseLine" ADD COLUMN     "description" TEXT,
ALTER COLUMN "stockItemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SupplierItemMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "stockItemId" TEXT,
    "baseQtyPerUnit" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItemMapping_organizationId_supplierId_itemKey_key" ON "SupplierItemMapping"("organizationId", "supplierId", "itemKey");

-- CreateIndex
CREATE INDEX "EDocument_organizationId_externalId_idx" ON "EDocument"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_organizationId_eInvoiceUuid_key" ON "PurchaseInvoice"("organizationId", "eInvoiceUuid");

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

