const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  await prisma.category.createMany({
    data: [
      { name: 'Smartphones', slug: 'smartphones' },
      { name: 'Tablets', slug: 'tablets' },
      { name: 'Laptops', slug: 'laptops' },
      { name: 'Wearables', slug: 'wearables' },
      { name: 'Accessories', slug: 'accessories' },
      { name: 'Mobile Covers', slug: 'mobile-covers' },
      { name: 'Smart Watch', slug: 'smart-watch' },
      { name: 'Bluetooth Headphones', slug: 'bluetooth-headphones' },
      { name: 'Headphones', slug: 'headphones' },
      { name: 'Keyboard', slug: 'keyboard' },
      { name: 'Mouse', slug: 'mouse' },
    ],
    skipDuplicates: true
  })
  console.log('Categories added!')
  await prisma.$disconnect()
}

main()