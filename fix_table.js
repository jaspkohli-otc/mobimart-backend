const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function fix() {
  try {
    // Create enums if they don't exist
    await p.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "DocumentType" AS ENUM ('CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)
    console.log('DocumentType enum ready')

    await p.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)
    console.log('DocumentStatus enum ready')

    // Create the table
    await p.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VendorDocument" (
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
      )
    `)
    console.log('VendorDocument table created successfully')

    // Verify
    const cols = await p.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'VendorDocument'
    `)
    console.log('Columns:', JSON.stringify(cols))

  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await p.$disconnect()
  }
}

fix()
