-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "condition" "ProductCondition" NOT NULL DEFAULT 'NEW';
