const { sendOrderConfirmation, sendStatusUpdate, sendVendorOrderNotification } = require('../lib/email')
const prisma = require('../lib/prisma')

const placeOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod } = req.body
    // COD orders are accepted immediately (CONFIRMED); card orders stay
    // PENDING until the MyFatoorah payment is verified, which flips them to
    // CONFIRMED. We also stash the payment method on the address JSON so the
    // order page can show "Cash on Delivery" vs "Paid".
    const method = paymentMethod === 'card' ? 'card' : 'cod'
    const addressWithMeta = { ...(shippingAddress || {}), paymentMethod: method }

    const user = await prisma.user.findUnique({
  where: { id: req.userId }
})

if (!user || user.approvalStatus !== 'ACTIVE') {
  return res.status(403).json({
    error: 'Your account is not approved to place orders'
  })
}

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
        status: method === 'cod' ? 'CONFIRMED' : 'PENDING',
        shippingAddress: addressWithMeta,
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
    sendOrderConfirmation({ ...order, shippingAddress: addressWithMeta }, userForEmail)

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
          { ...order, shippingAddress: addressWithMeta },
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
      select: { id: true, name: true, email: true, role: true, approvalStatus: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateUserApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { approvalStatus } = req.body

    const user = await prisma.user.update({
      where: { id },
      data: { approvalStatus }
    })

    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' })
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

// Orders that contain at least one product belonging to the logged-in vendor.
// Returns each order with only THIS vendor's items (so vendors don't see other
// vendors' lines in a shared order).
const getMyVendorOrders = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' })

    const orders = await prisma.order.findMany({
      where: { orderItems: { some: { vendorId: vendor.id } } },
      include: {
        user: { select: { name: true, phone: true } },
        orderItems: {
          where: { vendorId: vendor.id },
          include: { product: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Shape a lightweight payload for the vendor dashboard
    const result = orders.map(o => ({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      customerName: o.user?.name || 'Customer',
      paymentMethod: (o.shippingAddress && o.shippingAddress.paymentMethod) || 'cod',
      paid: !!o.paymentRef,
      shippingAddress: o.shippingAddress,
      items: o.orderItems.map(it => ({
        name: it.product?.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        vendorEarning: it.vendorEarning
      })),
      vendorTotal: o.orderItems.reduce((s, it) => s + (it.unitPrice * it.quantity), 0)
    }))

    res.json(result)
  } catch (error) {
    console.error('getMyVendorOrders error:', error.message)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = {
  updateUserApprovalStatus,
  placeOrder, getMyOrders, getOrder,
  getAllOrders, updateOrderStatus, getStats,
  getAllUsers, getAllVendorsAdmin,
  getMyVendorOrders
}