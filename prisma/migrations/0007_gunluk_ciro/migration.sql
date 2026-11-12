-- CreateTable
CREATE TABLE "DailyRevenue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "payments" JSONB NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRevenue_organizationId_date_idx" ON "DailyRevenue"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRevenue_branchId_date_key" ON "DailyRevenue"("branchId", "date");

-- AddForeignKey
ALTER TABLE "DailyRevenue" ADD CONSTRAINT "DailyRevenue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRevenue" ADD CONSTRAINT "DailyRevenue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
