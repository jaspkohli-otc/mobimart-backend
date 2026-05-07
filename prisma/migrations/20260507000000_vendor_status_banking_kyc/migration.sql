-- Migration: vendor status, banking details, KYC documents
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankBranch" TEXT;
CREATE TABLE IF NOT EXISTS "Subscription" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "vendorId" TEXT NOT NULL, "type" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "note" TEXT, "paidAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"), CONSTRAINT "Subscription_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE IF NOT EXISTS "VendorDocument" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "vendorId" TEXT NOT NULL, "docType" TEXT NOT NULL, "docName" TEXT NOT NULL, "docUrl" TEXT NOT NULL, "verified" BOOLEAN NOT NULL DEFAULT false, "note" TEXT, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id"), CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
