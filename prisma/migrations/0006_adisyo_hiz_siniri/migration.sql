-- AlterTable
ALTER TABLE "AdisyoConnection" ADD COLUMN     "lastRequestAt" TIMESTAMP(3),
ADD COLUMN     "nextPage" INTEGER,
ADD COLUMN     "runMaxDate" TIMESTAMP(3),
ADD COLUMN     "runStart" TIMESTAMP(3);

