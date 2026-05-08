const { sendOrderConfirmation, sendStatusUpdate, sendVendorOrderNotification } = require('../lib/email')
const prisma = require('../lib/prisma')

const placeOrder = async (req, res) => {
  try {
    const { shippingAddress } = req.body

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.userId },
      include: { product: { include: { vendor: true } } }
    })

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty' })
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)

    const order = await prisma.order.create({
      data: {
        userId: req.userId,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        shippingAddress,
        orderItems: {
          create: cartItems.map(item => {
            const lineTotal = item.product.price * item.quantity
            const commissionRate = item.product.vendor?.commissionRate || 0
            const platformFee = parseFloat((lineTotal * commissionRate).toFixed(2))
            const vendorEarning = parseFloat((lineTotal - platformFee).toFixed(2))
            return {
              productId: item.productId,
              vendorId: item.product.vendorId,
              quantity: item.quantity,
              unitPrice: item.product.price,
              platformFee,
              vendorEarning
            }
          })
        }
      },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            vendor: true
          }
        }
      }
    })

    await prisma.cartItem.deleteMany({ where: { userId: req.userId } })

    // ✅ Email customer invoice
    const userForEmail = await prisma.user.findUnique({ where: { id: req.userId } })
    sendOrderConfirmation({ ...order, shippingAddress }, userForEmail)

    // ✅ Email each vendor their items + dispatch info
    const vendorMap = {}
    for (const item of order.orderItems) {
      if (!item.vendorId) continue
      if (!vendorMap[item.vendorId]) vendorMap[item.vendorId] = []
      vendorMap[item.vendorId].push(item)
    }

    for (const [vendorId, items] of Object.entries(vendorMap)) {
      const vendorRecord = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: { user: { select: { email: true, name: true } } }
      })
      if (vendorRecord?.user?.email) {
        sendVendorOrderNotification(
          vendorRecord.user.email,
          vendorRecord.storeName,
          { ...order, shippingAddress },
          items
        )
      }
    }

    res.status(201).json({ message: 'Order placed successfully', order })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getMyOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true, images: true } },
            vendor: { select: { storeName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(orders)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getOrder = async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true, images: true } },
            vendor: { select: { storeName: true } }
          }
        },
        user: { select: { name: true, email: true, phone: true } }
      }
    })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.userId !== req.userId && req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Not your order' })
    }
    res.json(order)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAllOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { name: true, email: true } },
        orderItems: {
          include: {
            product: { select: { name: true } },
            vendor: { select: { storeName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(orders)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { orderItems: true }
    })
    if (!order) return res.status(404).json({ error: 'Order not found' })

    if (req.userRole === 'VENDOR') {
      const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
      const hasItems = order.orderItems.some(item => item.vendorId === vendor?.id)
      if (!hasItems) return res.status(403).json({ error: 'Not your order' })
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: { status }
    })

    const userForEmail = await prisma.user.findUnique({ where: { id: order.userId } })
    const orderWithAddress = await prisma.order.findUnique({ where: { id: req.params.id } })
    sendStatusUpdate(orderWithAddress, userForEmail, status)

    res.json({ message: 'Order status updated', order: updated })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getStats = async (req, res) => {
  try {
    const [totalOrders, totalUsers, totalVendors, totalProducts, revenueData] = await Promise.all([
      prisma.order.count(),
      prisma.user.count(),
      prisma.vendor.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: 'CANCELLED' } }
      })
    ])

    const platformFeeData = await prisma.orderItem.aggregate({ _sum: { platformFee: true } })
    const recentOrders = await prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } }
    })

    res.json({
      totalOrders, totalUsers, totalVendors, totalProducts,
      totalRevenue: revenueData._sum.totalAmount || 0,
      totalPlatformFee: platformFeeData._sum.platformFee || 0,
      recentOrders
    })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAllVendorsAdmin = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { products: true, orderItems: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(vendors)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = {
  placeOrder, getMyOrders, getOrder,
  getAllOrders, updateOrderStatus, getStats,
  getAllUsers, getAllVendorsAdmin
}