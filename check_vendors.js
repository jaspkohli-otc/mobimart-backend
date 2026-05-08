const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function check() {
  const vendors = await p.vendor.findMany({
    include: { user: { select: { email: true, name: true } } }
  })
  console.log(JSON.stringify(vendors.map(v => ({
    id: v.id,
    storeName: v.storeName,
    status: v.status,
    userEmail: v.user?.email,
    userName: v.user?.name
  })), null, 2))
  await p.$disconnect()
}

check().catch(console.error)
