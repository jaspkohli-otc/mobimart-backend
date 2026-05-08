const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function fix() {
  console.log('Fixing VendorDocument column types...')

  // Check current columns
  const cols = await p.$queryRawUnsafe(`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'VendorDocument' 
    ORDER BY column_name
  `)
  console.log('Current columns:')
  cols.forEach(c => console.log(` ${c.column_name}: ${c.data_type} (${c.udt_name})`))

  // Fix docType column - cast from text to DocumentType enum
  try {
    await p.$executeRawUnsafe(`
      ALTER TABLE "VendorDocument" 
      ALTER COLUMN "docType" TYPE "DocumentType" 
      USING "docType"::"DocumentType"
    `)
    console.log('✅ Fixed docType column to DocumentType enum')
  } catch (e) {
    console.log('docType fix error:', e.message)
  }

  // Fix status column - cast from text/verified to DocumentStatus enum
  try {
    await p.$executeRawUnsafe(`
      ALTER TABLE "VendorDocument" 
      ALTER COLUMN "status" TYPE "DocumentStatus" 
      USING "status"::"DocumentStatus"
    `)
    console.log('✅ Fixed status column to DocumentStatus enum')
  } catch (e) {
    console.log('status fix error:', e.message)
  }

  // Check if verified column exists (old schema) - rename to status
  try {
    await p.$executeRawUnsafe(`
      ALTER TABLE "VendorDocument" 
      RENAME COLUMN "verified" TO "status_old"
    `)
    console.log('Renamed verified column')
  } catch (e) {
    console.log('No verified column to rename')
  }

  // Final check
  const finalCols = await p.$queryRawUnsafe(`
    SELECT column_name, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'VendorDocument' 
    ORDER BY column_name
  `)
  console.log('Final columns:')
  finalCols.forEach(c => console.log(` ${c.column_name}: ${c.udt_name}`))

  console.log('✅ All fixes complete!')
  await p.$disconnect()
}

fix().catch(async e => {
  console.error('Error:', e.message)
  await p.$disconnect()
})
