-- Şirket (tüzel kişi) katmanı: Grup (Organization) → Şirket (Company) → Şube (Branch)
-- Mevcut veri korunur: her grup için, grubun mevcut ünvan/vergi bilgisiyle bir şirket açılır;
-- tüm şubeler ve cari hareketleri bu şirkete bağlanır.

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxNumber" TEXT,
    "taxOffice" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Mevcut gruplar için varsayılan şirket
INSERT INTO "Company" ("id", "organizationId", "name", "taxNumber", "taxOffice")
SELECT 'cmp_' || "id", "id", "name", "taxNumber", "taxOffice" FROM "Organization";

-- Branch.companyId
ALTER TABLE "Branch" ADD COLUMN "companyId" TEXT;
UPDATE "Branch" SET "companyId" = 'cmp_' || "organizationId";
ALTER TABLE "Branch" ALTER COLUMN "companyId" SET NOT NULL;

-- LedgerEntry.companyId (şubesi varsa şubenin şirketi, yoksa grubun varsayılan şirketi)
ALTER TABLE "LedgerEntry" ADD COLUMN "companyId" TEXT;
UPDATE "LedgerEntry" l SET "companyId" = COALESCE(
    (SELECT b."companyId" FROM "Branch" b WHERE b."id" = l."branchId"),
    'cmp_' || l."organizationId"
);
ALTER TABLE "LedgerEntry" ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Company_organizationId_idx" ON "Company"("organizationId");
CREATE UNIQUE INDEX "Company_organizationId_taxNumber_key" ON "Company"("organizationId", "taxNumber");
CREATE INDEX "LedgerEntry_companyId_accountId_idx" ON "LedgerEntry"("companyId", "accountId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
