const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

p.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'VendorDocument'`)
  .then(r => {
    console.log(JSON.stringify(r))
    p.$disconnect()
  })
  .catch(e => {
    console.error(e.message)
    p.$disconnect()
  })
