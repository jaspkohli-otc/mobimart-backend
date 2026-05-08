const prisma = require('../lib/prisma')
const multer = require('multer')
const xlsx = require('xlsx')
const cloudinary = require('cloudinary').v2
const { Readable } = require('stream')
const { sendVendorStatusEmail } = require('../lib/email')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const storage = multer.memoryStorage()
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'image') {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files allowed'), false)
  } else if (file.fieldname === 'excel') {
    if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls'))
      cb(null, true)
    else cb(new Error('Only Excel files allowed'), false)
  } else {
    cb(null, true)
  }
}
const upload = multer({ storage, fileFilter })

const createStore = async (req, res) => {
  try {
    const { storeName, description } = req.body
    const existing = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (existing) return res.status(400).json({ error: 'You already have a store' })
    const vendor = await prisma.vendor.create({
      data: { userId: req.userId, storeName, description, status: 'PENDING' }
    })
    res.status(201).json({ message: 'Store created successfully', vendor })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getMyStore = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.userId },
      include: {
        products: {
          where: { isActive: true },
          include: { category: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        documents: { orderBy: { uploadedAt: 'desc' } }
      }
    })
    if (!vendor) return res.status(404).json({ error: 'No store found' })
    res.json(vendor)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAllVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: { _count: { select: { products: true } } }
    })
    res.json(vendors)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' })
    const imageUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mobimart/products', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error)
          else resolve(result.secure_url)
        }
      )
      Readable.from(req.file.buffer).pipe(uploadStream)
    })
    res.json({ message: 'Image uploaded successfully', imageUrl })
  } catch (error) {
    res.status(500).json({ error: 'Image upload failed' })
  }
}

const bulkUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No Excel file uploaded' })
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(403).json({ error: 'You need a store first' })
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet)
    if (rows.length === 0) return res.status(400).json({ error: 'Excel file is empty' })
    const created = []
    const errors = []
    for (const [index, row] of rows.entries()) {
      try {
        if (!row.Name || !row.Price || !row.Stock) {
          errors.push(`Row ${index + 2}: Missing required fields`)
          continue
        }
        const product = await prisma.product.create({
          data: {
            vendorId: vendor.id,
            name: String(row.Name),
            description: String(row.Description || ''),
            price: parseFloat(row.Price),
            stockQty: parseInt(row.Stock),
            categoryId: row.CategoryId ? String(row.CategoryId) : null,
            images: []
          }
        })
        created.push(product)
      } catch (err) {
        errors.push(`Row ${index + 2}: ${err.message}`)
      }
    }
    res.json({ message: `Bulk upload complete: ${created.length} products added`, created: created.length, errors })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getMyEarnings = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'No store found' })
    const orderItems = await prisma.orderItem.findMany({
      where: { vendorId: vendor.id },
      include: {
        order: { select: { id: true, status: true, createdAt: true, shippingAddress: true } },
        product: { select: { name: true, images: true } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    })
    const payouts = await prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' } })
    const totalSales = orderItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    const totalPlatformFee = orderItems.reduce((sum, item) => sum + item.platformFee, 0)
    const totalEarnings = orderItems.reduce((sum, item) => sum + item.vendorEarning, 0)
    const totalPaid = payouts.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)
    const pendingPayout = totalEarnings - totalPaid
    res.json({
      vendor: { storeName: vendor.storeName, commissionRate: vendor.commissionRate, ibanNumber: vendor.ibanNumber },
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalPlatformFee: parseFloat(totalPlatformFee.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        pendingPayout: parseFloat(pendingPayout.toFixed(2))
      },
      orderItems,
      payouts
    })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateIban = async (req, res) => {
  try {
    const { ibanNumber } = req.body
    const vendor = await prisma.vendor.update({ where: { userId: req.userId }, data: { ibanNumber } })
    res.json({ message: 'IBAN updated successfully', vendor })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Vendor — update full bank details
const updateBankDetails = async (req, res) => {
  try {
    const { ibanNumber, bankName, accountHolderName, accountNumber, bankBranch } = req.body
    const vendor = await prisma.vendor.update({
      where: { userId: req.userId },
      data: { ibanNumber, bankName, accountHolderName, accountNumber, bankBranch }
    })
    res.json({ message: 'Bank details updated successfully', vendor })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAdminPayouts = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true } },
        orderItems: true,
        payouts: true,
        subscriptions: true,
        _count: { select: { products: true } }
      }
    })
    const vendorSummaries = vendors.map(vendor => {
      const totalSales = vendor.orderItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
      const totalPlatformFee = vendor.orderItems.reduce((sum, item) => sum + item.platformFee, 0)
      const totalEarnings = vendor.orderItems.reduce((sum, item) => sum + item.vendorEarning, 0)
      const totalPaid = vendor.payouts.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)
      const pendingPayout = totalEarnings - totalPaid
      return {
        id: vendor.id,
        storeName: vendor.storeName,
        ownerName: vendor.user?.name,
        ownerEmail: vendor.user?.email,
        ibanNumber: vendor.ibanNumber,
        commissionRate: vendor.commissionRate,
        status: vendor.status,
        subscriptions: vendor.subscriptions,
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalPlatformFee: parseFloat(totalPlatformFee.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        pendingPayout: parseFloat(pendingPayout.toFixed(2)),
        payouts: vendor.payouts
      }
    })
    const totalPlatformRevenue = vendorSummaries.reduce((sum, v) => sum + v.totalPlatformFee, 0)
    const totalPendingPayouts = vendorSummaries.reduce((sum, v) => sum + v.pendingPayout, 0)
    res.json({
      summary: {
        totalPlatformRevenue: parseFloat(totalPlatformRevenue.toFixed(2)),
        totalPendingPayouts: parseFloat(totalPendingPayouts.toFixed(2))
      },
      vendors: vendorSummaries
    })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const markPayoutPaid = async (req, res) => {
  try {
    const { vendorId, amount, note } = req.body
    const payout = await prisma.payout.create({
      data: { vendorId, amount: parseFloat(amount), status: 'PAID', note, paidAt: new Date() }
    })
    res.json({ message: 'Payout marked as paid', payout })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — approve or reject vendor store
const updateVendorStatus = async (req, res) => {
  try {
    const { vendorId, status, note } = req.body
    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING']
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status, rejectionNote: note || null },
      include: { user: true }
    })

    if (vendor.user?.email) {
      sendVendorStatusEmail(vendor.user.email, vendor.user.name, vendor.storeName, status, note)
    }

    res.json({ message: `Vendor ${status.toLowerCase()}`, vendor })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — record subscription payment
const addSubscription = async (req, res) => {
  try {
    const { vendorId, type, amount, note } = req.body
    const sub = await prisma.subscription.create({
      data: { vendorId, type, amount: parseFloat(amount), note }
    })
    res.json({ message: 'Subscription recorded', subscription: sub })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — get all vendors with documents and bank details
const getAllVendorsAdmin = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true } },
        documents: { orderBy: { uploadedAt: 'desc' } },
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
  createStore, getMyStore, getAllVendors,
  uploadImage, bulkUpload, upload,
  getMyEarnings, updateIban, updateBankDetails,
  getAdminPayouts, markPayoutPaid,
  updateVendorStatus, addSubscription, getAllVendorsAdmin
}
