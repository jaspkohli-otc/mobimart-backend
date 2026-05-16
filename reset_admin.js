const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function reset() {
  const hash = await bcrypt.hash('Admin@1234', 10)

  await prisma.user.update({
    where: { email: 'priya@gmail.com' },
    data: {
      passwordHash: hash,
      approvalStatus: 'ACTIVE',
      role: 'ADMIN'
    }
  })

  console.log('Admin reset complete')
  await prisma.$disconnect()
}

reset()