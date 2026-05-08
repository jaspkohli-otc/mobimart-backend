-- Drop the broken manually-created VendorDocument table
DROP TABLE IF EXISTS "VendorDocument";

-- Ensure enums exist (won't error if already there)
DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recreate correctly with proper enum column types
CREATE TABLE "VendorDocument" (
  "id"          TEXT NOT NULL,
  "vendorId"    TEXT NOT NULL,
  "docType"     "DocumentType" NOT NULL,
  "docName"     TEXT NOT NULL,
  "fileUrl"     TEXT NOT NULL,
  "status"      "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "note"        TEXT,
  "uploadedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"  TIMESTAMP(3),

  CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorDocument_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);