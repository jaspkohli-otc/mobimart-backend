-- Migration: vendor status, banking details, KYC documents (fixed)

-- Add enums
DO $$ BEGIN
  CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add columns to Vendor
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "status" "VendorStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankBranch" TEXT;

-- Create Subscription table
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_vendorId_fkey" FOREIGN KEY ("vendorId")
    REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create VendorDocument table
CREATE TABLE IF NOT EXISTS "VendorDocument" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "docType" "DocumentType" NOT NULL,
  "docName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId")
    REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
