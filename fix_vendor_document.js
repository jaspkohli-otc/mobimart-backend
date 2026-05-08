const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function fix() {
  console.log('Checking VendorDocument columns...')

  // Check existing columns
  const cols = await p.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'VendorDocument' ORDER BY column_name
  `)
  console.log('Current columns:', cols.map(c => c.column_name).join(', '))

  // Add missing columns if they don't exist
  await p.$executeRawUnsafe(`ALTER TABLE "VendorDocument" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT NOT NULL DEFAULT ''`)
  console.log('Added fileUrl column')

  await p.$executeRawUnsafe(`ALTER TABLE "VendorDocument" ADD COLUMN IF NOT EXISTS "docName" TEXT NOT NULL DEFAULT ''`)
  console.log('Added docName column')

  await p.$executeRawUnsafe(`ALTER TABLE "VendorDocument" ADD COLUMN IF NOT EXISTS "note" TEXT`)
  console.log('Added note column')

  await p.$executeRawUnsafe(`ALTER TABLE "VendorDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3)`)
  console.log('Added reviewedAt column')

  // Check if status column exists with right type - add if missing
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "VendorDocument" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING'`)
    console.log('Added status column')
  } catch (e) {
    console.log('status column already exists or DocumentStatus enum missing:', e.message)
  }

  // Check final columns
  const finalCols = await p.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'VendorDocument' ORDER BY column_name
  `)
  console.log('Final columns:', finalCols.map(c => c.column_name).join(', '))

  console.log('✅ Fix complete!')
  await p.$disconnect()
}

fix().catch(async e => {
  console.error('Error:', e.message)
  await p.$disconnect()
})
