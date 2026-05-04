const prisma = require('../lib/prisma')
const multer = require('multer')
const xlsx = require('xlsx')
const cloudinary = require('cloudinary').v2
const { Readable } = require('stream')

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// ✅ Use memory storage instead of disk (for Cloudinary)
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
      data: { userId: req.userId, storeName, description }
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
        }
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

// ✅ Upload image to Cloudinary
const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' })

    // Upload buffer to Cloudinary
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
    console.error('Cloudinary upload error:', error)
    res.status(500).json({ error: 'Image upload failed' })
  }
}

// ✅ Bulk upload via Excel
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
          errors.push(`Row ${index + 2}: Missing required fields (Name, Price, Stock)`)
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

    res.json({
      message: `Bulk upload complete: ${created.length} products added`,
      created: created.length,
      errors
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { createStore, getMyStore, getAllVendors, uploadImage, bulkUpload, upload }