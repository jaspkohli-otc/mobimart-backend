const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function clean() {
  await p.review.deleteMany()
  await p.payout.deleteMany()
  await p.orderItem.deleteMany()
  await p.order.deleteMany()
  await p.cartItem.deleteMany()
  await p.product.deleteMany()
  await p.vendor.deleteMany()
  await p.user.deleteMany()
  console.log('All cleared!')
  await p.$disconnect()
}

clean()
