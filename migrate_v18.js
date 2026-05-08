const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function migrate() {
  console.log('Running v18 migration...')

  try {
    await p.$executeRawUnsafe(`CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED')`)
    console.log('Created VendorStatus enum')
  } catch (e) { console.log('VendorStatus enum already exists — skipping') }

  try {
    await p.$executeRawUnsafe(`CREATE TYPE "DocumentType" AS ENUM ('CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY')`)
    console.log('Created DocumentType enum')
  } catch (e) { console.log('DocumentType enum already exists — skipping') }

  try {
    await p.$executeRawUnsafe(`CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED')`)
    console.log('Created DocumentStatus enum')
  } catch (e) { console.log('DocumentStatus enum already exists — skipping') }

  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "status" "VendorStatus" NOT NULL DEFAULT 'PENDING'`)
  console.log('Added status column')

  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT`)
  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankName" TEXT`)
  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT`)
  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT`)
  await p.$executeRawUnsafe(`ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bankBranch" TEXT`)
  console.log('Added bank detail columns')

  await p.$executeRawUnsafe(`
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
    )
  `)
  console.log('Created Subscription table')

  await p.$executeRawUnsafe(`
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
    )
  `)
  console.log('Created VendorDocument table')

  console.log('✅ Migration complete! All tables created.')
  await p.$disconnect()
}

migrate().catch(e => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
