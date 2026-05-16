const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function reset() {
  const hash = await bcrypt.hash('Admin@1234', 10)

await prisma.user.upsert({
  where: { email: 'priya@gmail.com' },
  update: {
    passwordHash: hash,
    approvalStatus: 'ACTIVE',
    role: 'ADMIN'
  },
  create: {
    name: 'Priya Admin',
    email: 'priya@gmail.com',
    passwordHash: hash,
    approvalStatus: 'ACTIVE',
    role: 'ADMIN'
  }
})

  console.log('Admin reset complete')
  await prisma.$disconnect()
}

reset()