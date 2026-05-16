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
    if (
      file.mimetype.includes('spreadsheet') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true)
    } else {
      cb(new Error('Only Excel files allowed'), false)
    }
  } else {
    cb(null, true)
  }
}

const upload = multer({ storage, fileFilter })

const createStore = async (req, res) => {
  try {
    const { storeName, description } = req.body

    const existing = await prisma.vendor.findUnique({
      where: { userId: req.userId }
    })

    if (existing) {
      return res.status(400).json({ error: 'You already have a store' })
    }

    const vendor = await prisma.vendor.create({
      data: {
        userId: req.userId,
        storeName,
        description,
        status: 'PENDING'
      }
    })

    res.status(201).json({ message: 'Store created successfully', vendor })
  } catch (error) {
    console.error(error)
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
        }
      }
    })

    if (!vendor) {
      return res.status(404).json({ error: 'No store found' })
    }

    res.json(vendor)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getAllVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        _count: { select: { products: true } }
      }
    })

    res.json(vendors)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

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
    console.error(error)
    res.status(500).json({ error: 'Image upload failed' })
  }
}

const bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' })
    }

    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.userId }
    })

    if (!vendor) {
      return res.status(403).json({ error: 'You need a store first' })
    }

    if (vendor.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Vendor approval required' })
    }

    if (vendor.subscriptionStatus !== 'ACTIVE') {
      return res.status(403).json({ error: 'Active subscription required' })
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    const headerIndex = data.findIndex(row =>
      row.includes('Product Name') || row.includes('Name')
    )

    if (headerIndex === -1) {
      return res.status(400).json({
        error: 'Header row not found. Please use Product Name column.'
      })
    }

    const headers = data[headerIndex].map(header =>
      String(header || '').trim()
    )

    const rows = data.slice(headerIndex + 1).map(row => {
      const obj = {}
      headers.forEach((header, i) => {
        if (header) obj[header] = row[i]
      })
      return obj
    })

    const cleanNumber = (value) => {
      if (value === undefined || value === null || value === '') return 0
      return Number(String(value).replace(/,/g, '').trim())
    }

    const normalizeCondition = (value) => {
      const raw = String(value || 'New').trim().toUpperCase()
      if (raw === 'LIKE NEW') return 'LIKE_NEW'
      if (raw === 'GOOD') return 'GOOD'
      if (raw === 'FAIR') return 'FAIR'
      return 'NEW'
    }

    const created = []
    const errors = []

    for (const [index, row] of rows.entries()) {
      try {
        const name = row['Product Name'] || row.Name || row.name

        const description =
          row['Full Description'] ||
          row['Short Description'] ||
          row.Description ||
          row.description ||
          ''

        const price = cleanNumber(row['Price QAR'] || row.Price || row.price)
        const stockQty = cleanNumber(row['Stock Qty'] || row.Stock || row.stockQty)
        const condition = normalizeCondition(row.Condition || row.condition)
        const vendorSKU = row['Vendor SKU'] || row.SKU || row.vendorSKU || ''
const brand = row.Brand || row.brand || ''
const model = row.Model || row.model || ''
const warranty =
  row['Warranty Period'] ||
  row['Warranty Type'] ||
  row.Warranty ||
  row.warranty ||
  ''

const deliveryOption =
  row['Delivery Option'] ||
  row.deliveryOption ||
  ''

const codEligible =
  String(row['COD Eligible'] || '').toLowerCase() === 'yes'

const freeDeliveryEligible =
  String(row['Free Delivery Eligible'] || '').toLowerCase() === 'yes'

const compareAtPrice = cleanNumber(
  row['Compare At Price QAR'] ||
  row['Compare At Price'] ||
  row.compareAtPrice
)

        const imageUrl =
          row['Main Image URL'] ||
          row['Image URL'] ||
          row.imageUrl ||
          row.Image ||
          ''

        const imageUrl2 =
          row['Image URL 2'] ||
          row['Image Url 2'] ||
          row['Image 2'] ||
          ''

        const imageUrl3 =
          row['Image URL 3'] ||
          row['Image Url 3'] ||
          row['Image 3'] ||
          ''

        const images = [imageUrl, imageUrl2, imageUrl3].filter(Boolean)

        const categoryName = row.Category || row.category
        const categoryId = row.CategoryId || row.categoryId

        if (!name || !price || !stockQty) {
          errors.push(`Row ${index + headerIndex + 2}: Missing name, price, or stock`)
          continue
        }

        let finalCategoryId = categoryId

        if (!finalCategoryId && categoryName) {
          let category = await prisma.category.findFirst({
            where: {
              name: {
                equals: String(categoryName).trim(),
                mode: 'insensitive'
              }
            }
          })

          if (!category) {
            category = await prisma.category.create({
              data: {
                name: String(categoryName).trim(),
                slug: String(categoryName)
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
              }
            })
          }

          finalCategoryId = category.id
        }

        if (!finalCategoryId) {
          errors.push(`Row ${index + headerIndex + 2}: Category missing`)
          continue
        }

        const product = await prisma.product.create({
          data: {
            vendorId: vendor.id,
            categoryId: finalCategoryId,
            name: String(name).trim(),
description: String(description || '').trim(),

vendorSKU: String(vendorSKU || '').trim(),
brand: String(brand || '').trim(),
model: String(model || '').trim(),
warranty: String(warranty || '').trim(),
deliveryOption: String(deliveryOption || '').trim(),

codEligible,
freeDeliveryEligible,

compareAtPrice: compareAtPrice || null,

price,
            stockQty: parseInt(stockQty),
            images,
            condition
          }
        })

        created.push(product)
      } catch (err) {
        errors.push(`Row ${index + headerIndex + 2}: ${err.message}`)
      }
    }

    res.json({
      message: `Bulk upload complete: ${created.length} products added`,
      createdCount: created.length,
      errors
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Bulk upload failed' })
  }
}

const getMyEarnings = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.userId }
    })

    if (!vendor) {
      return res.status(404).json({ error: 'No store found' })
    }

    const orderItems = await prisma.orderItem.findMany({
      where: { vendorId: vendor.id },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            shippingAddress: true
          }
        },
        product: { select: { name: true, images: true } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    })

    const payouts = await prisma.payout.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' }
    })

    const totalSales = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const totalPlatformFee = orderItems.reduce((sum, item) => sum + item.platformFee, 0)
    const totalEarnings = orderItems.reduce((sum, item) => sum + item.vendorEarning, 0)
    const totalPaid = payouts
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0)

    const pendingPayout = totalEarnings - totalPaid

    res.json({
      vendor: {
        storeName: vendor.storeName,
        commissionRate: vendor.commissionRate,
        ibanNumber: vendor.ibanNumber
      },
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
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateIban = async (req, res) => {
  try {
    const { ibanNumber } = req.body

    const vendor = await prisma.vendor.update({
      where: { userId: req.userId },
      data: { ibanNumber }
    })

    res.json({ message: 'IBAN updated successfully', vendor })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateBankDetails = async (req, res) => {
  try {
    const {
      ibanNumber,
      bankName,
      accountHolderName,
      accountNumber,
      bankBranch
    } = req.body

    const vendor = await prisma.vendor.update({
      where: { userId: req.userId },
      data: {
        ibanNumber,
        bankName,
        accountHolderName,
        accountNumber,
        bankBranch
      }
    })

    res.json({ message: 'Bank details updated successfully', vendor })
  } catch (error) {
    console.error(error)
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
      const totalSales = vendor.orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const totalPlatformFee = vendor.orderItems.reduce((sum, item) => sum + item.platformFee, 0)
      const totalEarnings = vendor.orderItems.reduce((sum, item) => sum + item.vendorEarning, 0)
      const totalPaid = vendor.payouts
        .filter(p => p.status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0)

      const pendingPayout = totalEarnings - totalPaid

      return {
        id: vendor.id,
        storeName: vendor.storeName,
        ownerName: vendor.user?.name,
        ownerEmail: vendor.user?.email,
        ibanNumber: vendor.ibanNumber,
        commissionRate: vendor.commissionRate,
        status: vendor.status,
        enrollmentPaid: vendor.enrollmentPaid,
        monthlyFeePaid: vendor.monthlyFeePaid,
        annualRenewalPaid: vendor.annualRenewalPaid,
        monthlyFeeDueDate: vendor.monthlyFeeDueDate,
        annualRenewalDueDate: vendor.annualRenewalDueDate,
        subscriptions: vendor.subscriptions,
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalPlatformFee: parseFloat(totalPlatformFee.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        pendingPayout: parseFloat(pendingPayout.toFixed(2)),
        payouts: vendor.payouts
      }
    })

  const totalPlatformRevenue = vendorSummaries.reduce((sum, v) => {
  let feeRevenue = 0

  if (v.enrollmentPaid) feeRevenue += 1000
  if (v.monthlyFeePaid) feeRevenue += 250
  if (v.annualRenewalPaid) feeRevenue += 500

  return sum + feeRevenue
}, 0)
    const totalPendingPayouts = vendorSummaries.reduce((sum, v) => sum + v.pendingPayout, 0)

    res.json({
      summary: {
        totalPlatformRevenue: parseFloat(totalPlatformRevenue.toFixed(2)),
        totalPendingPayouts: parseFloat(totalPendingPayouts.toFixed(2))
      },
      vendors: vendorSummaries
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const markPayoutPaid = async (req, res) => {
  try {
    const { vendorId, amount, note } = req.body

    const payout = await prisma.payout.create({
      data: {
        vendorId,
        amount: parseFloat(amount),
        status: 'PAID',
        note,
        paidAt: new Date()
      }
    })

    res.json({ message: 'Payout marked as paid', payout })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateVendorStatus = async (req, res) => {
  try {
    const { vendorId, status, note } = req.body
    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING']

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        status,
        rejectionNote: note || null,
        isVerified: status === 'APPROVED'
      },
      include: { user: true }
    })

    await prisma.user.update({
      where: { id: vendor.userId },
      data: {
        approvalStatus:
          status === 'APPROVED'
            ? 'ACTIVE'
            : status === 'REJECTED'
            ? 'BLOCKED'
            : 'PENDING'
      }
    })

    if (vendor.user?.email) {
      sendVendorStatusEmail(
        vendor.user.email,
        vendor.user.name,
        vendor.storeName,
        status,
        note
      )
    }

    res.json({ message: `Vendor ${status.toLowerCase()}`, vendor })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const addSubscription = async (req, res) => {
  try {
    const { vendorId, type, amount, note } = req.body

    const sub = await prisma.subscription.create({
      data: {
        vendorId,
        type,
        amount: parseFloat(amount),
        note
      }
    })

    res.json({ message: 'Subscription recorded', subscription: sub })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

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
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateVendorSubscription = async (req, res) => {
  try {
    const { vendorId } = req.params
    const { subscriptionStatus, subscriptionPlan } = req.body

    let expiry = null

    if (subscriptionStatus === 'ACTIVE') {
      expiry = new Date()
      expiry.setFullYear(expiry.getFullYear() + 1)
    }

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        subscriptionStatus,
        subscriptionPlan,
        subscriptionExpiry: expiry
      }
    })

    res.json(vendor)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
const updateVendorFees = async (req, res) => {
  try {
    const { vendorId } = req.params
  const {
  enrollmentPaid,
  monthlyFeePaid,
  annualRenewalPaid,
  subscriptionDiscountPercent,
  subscriptionDiscountReason
} = req.body

    const data = {}

    if (typeof enrollmentPaid === 'boolean') {
      data.enrollmentPaid = enrollmentPaid
    }

    if (typeof monthlyFeePaid === 'boolean') {
      data.monthlyFeePaid = monthlyFeePaid

      if (monthlyFeePaid) {
        const nextMonth = new Date()
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        nextMonth.setDate(1)
        data.monthlyFeeDueDate = nextMonth
      }
    }

    if (typeof annualRenewalPaid === 'boolean') {
      data.annualRenewalPaid = annualRenewalPaid

      if (annualRenewalPaid) {
        const nextYear = new Date()
        nextYear.setFullYear(nextYear.getFullYear() + 1)
        data.annualRenewalDueDate = nextYear
      }
    }
    if (typeof subscriptionDiscountPercent === 'number') {
  data.subscriptionDiscountPercent = subscriptionDiscountPercent
}

if (typeof subscriptionDiscountReason === 'string') {
  data.subscriptionDiscountReason = subscriptionDiscountReason
}

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data
    })

    res.json(vendor)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  createStore,
  getMyStore,
  getAllVendors,
  uploadImage,
  bulkUpload,
  upload,
  getMyEarnings,
  updateIban,
  updateBankDetails,
  getAdminPayouts,
  markPayoutPaid,
  updateVendorStatus,
  addSubscription,
  getAllVendorsAdmin,
  updateVendorFees,
  updateVendorSubscription
}