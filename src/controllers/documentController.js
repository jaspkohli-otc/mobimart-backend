const prisma = require('../lib/prisma')
const cloudinary = require('cloudinary').v2
const multer = require('multer')
const { Readable } = require('stream')
const { sendVendorStatusEmail } = require('../lib/email')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Only PDF, JPG, PNG files allowed'), false)
  }
})

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { docType, docName } = req.body
    const validTypes = ['CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY']
    if (!validTypes.includes(docType)) return res.status(400).json({ error: 'Invalid document type' })

    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'No store found' })

    const fileUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mobimart/kyc-documents', resource_type: 'auto', public_id: `${vendor.id}_${docType}_${Date.now()}` },
        (error, result) => { if (error) reject(error); else resolve(result.secure_url) }
      )
      Readable.from(req.file.buffer).pipe(uploadStream)
    })

    const finalDocName = docName || req.file.originalname

    // Upsert — update if exists, create if not
    const existing = await prisma.vendorDocument.findFirst({
      where: { vendorId: vendor.id, docType }
    })

    let document
    if (existing) {
      document = await prisma.vendorDocument.update({
        where: { id: existing.id },
        data: { docName: finalDocName, fileUrl, status: 'PENDING', note: null, uploadedAt: new Date(), reviewedAt: null }
      })
    } else {
      document = await prisma.vendorDocument.create({
        data: { vendorId: vendor.id, docType, docName: finalDocName, fileUrl, status: 'PENDING' }
      })
    }

    res.status(201).json({ message: 'Document uploaded successfully', document })
  } catch (error) {
    console.error('Document upload error:', error)
    res.status(500).json({ error: error.message || 'Document upload failed' })
  }
}

const getMyDocuments = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'No store found' })

    const documents = await prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(Array.isArray(documents) ? documents : [])
  } catch (error) {
    console.error('getMyDocuments error:', error)
    res.status(500).json({ error: error.message })
  }
}

const getAllDocuments = async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true } },
        documents: { orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(vendors)
  } catch (error) {
    console.error('getAllDocuments error:', error)
    res.status(500).json({ error: error.message })
  }
}

const reviewDocument = async (req, res) => {
  try {
    const { status, note } = req.body
    if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const document = await prisma.vendorDocument.update({
      where: { id: req.params.id },
      data: { status, note: note || null, reviewedAt: new Date() }
    })

    if (!document) return res.status(404).json({ error: 'Document not found' })

    // Check if all required docs are approved — auto-approve vendor
    const requiredDocs = ['CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID']
    const allDocs = await prisma.vendorDocument.findMany({ where: { vendorId: document.vendorId } })
    const allRequiredApproved = requiredDocs.every(type =>
      allDocs.some(d => d.docType === type && d.status === 'APPROVED')
    )

    if (allRequiredApproved) {
      await prisma.vendor.update({
        where: { id: document.vendorId },
        data: { status: 'APPROVED', isVerified: true }
      })

      const vendor = await prisma.vendor.findUnique({
        where: { id: document.vendorId },
        include: { user: { select: { email: true, name: true } } }
      })

      if (vendor?.user?.email) {
        sendVendorStatusEmail(vendor.user.email, vendor.user.name, vendor.storeName, 'APPROVED', null)
      }
    }

    res.json({ message: `Document ${status.toLowerCase()}`, document, vendorFullyApproved: allRequiredApproved })
  } catch (error) {
    console.error('reviewDocument error:', error)
    res.status(500).json({ error: error.message })
  }
}

const getVendorBankDetails = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.vendorId },
      include: { user: { select: { name: true, email: true } } }
    })
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' })
    res.json(vendor)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { upload, uploadDocument, getMyDocuments, getAllDocuments, reviewDocument, getVendorBankDetails }