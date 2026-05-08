const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient()

async function resetPassword() {
  const hash = await bcrypt.hash('Vendor@1234', 10)
  const user = await p.user.update({
    where: { email: 'jaspkohli@gmail.com' },
    data: { passwordHash: hash }
  })
  console.log('Password reset for:', user.email)
  console.log('New password: Vendor@1234')
  await p.$disconnect()
}

resetPassword().catch(console.error)
