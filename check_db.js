const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function checkAndFix() {
  console.log('Checking vendor table columns...')

  // Check if status column exists
  const columns = await p.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Vendor'
    ORDER BY column_name
  `)
  console.log('Current Vendor columns:', JSON.stringify(columns, null, 2))

  // Check if VendorDocument table exists
  const tables = await p.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)
  console.log('All tables:', tables.map(t => t.table_name).join(', '))

  // Check vendors with status
  const vendors = await p.$queryRawUnsafe(`SELECT id, "storeName", "status" FROM "Vendor" LIMIT 5`)
  console.log('Vendors with status:', JSON.stringify(vendors, null, 2))

  await p.$disconnect()
}

checkAndFix().catch(async e => {
  console.error('Error:', e.message)
  await p.$disconnect()
})
