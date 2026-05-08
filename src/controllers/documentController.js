const prisma = require('../lib/prisma')
const cloudinary = require('cloudinary').v2
const multer = require('multer')
const { Readable } = require('stream')
const { sendVendorStatusEmail } = require('../lib/email')
const { randomUUID } = require('crypto')

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

    const vendors = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Vendor" WHERE "userId" = $1 LIMIT 1`,
      req.userId
    )
    if (!vendors.length) return res.status(404).json({ error: 'No store found' })
    const vendorId = vendors[0].id

    const docUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mobimart/kyc-documents',
          resource_type: 'auto',
          public_id: `${vendorId}_${docType}_${Date.now()}`
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary error:', JSON.stringify(error))
            reject(new Error('Cloudinary upload failed: ' + error.message))
          } else if (!result || !result.secure_url) {
            reject(new Error('Cloudinary did not return a URL'))
          } else {
            console.log('Cloudinary success:', result.secure_url)
            resolve(result.secure_url)
          }
        }
      )
      Readable.from(req.file.buffer).pipe(uploadStream)
    })

    const finalDocName = docName || req.file.originalname
    const now = new Date().toISOString()

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "VendorDocument" WHERE "vendorId" = $1 AND "docType" = $2::text::"DocumentType" LIMIT 1`,
      vendorId, docType
    )

    let document
    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE "VendorDocument" SET "docName" = $1, "docUrl" = $2, "status" = 'PENDING'::"DocumentStatus", "note" = NULL, "uploadedAt" = $3, "reviewedAt" = NULL WHERE id = $4`,
        finalDocName, docUrl, now, existing[0].id
      )
      const updated = await prisma.$queryRawUnsafe(`SELECT * FROM "VendorDocument" WHERE id = $1`, existing[0].id)
      document = updated[0]
    } else {
      const id = randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO "VendorDocument" (id, "vendorId", "docType", "docName", "docUrl", status, "uploadedAt") VALUES ($1, $2, $3::text::"DocumentType", $4, $5, 'PENDING'::"DocumentStatus", $6)`,
        id, vendorId, docType, finalDocName, docUrl, now
      )
      const created = await prisma.$queryRawUnsafe(`SELECT * FROM "VendorDocument" WHERE id = $1`, id)
      document = created[0]
    }

    res.status(201).json({ message: 'Document uploaded successfully', document })
  } catch (error) {
    console.error('Document upload error:', error.message)
    res.status(500).json({ error: error.message || 'Document upload failed' })
  }
}

const getMyDocuments = async (req, res) => {
  try {
    const vendors = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Vendor" WHERE "userId" = $1 LIMIT 1`,
      req.userId
    )
    if (!vendors.length) return res.status(404).json({ error: 'No store found' })

    const documents = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VendorDocument" WHERE "vendorId" = $1 ORDER BY "uploadedAt" DESC`,
      vendors[0].id
    )
    res.json(Array.isArray(documents) ? documents : [])
  } catch (error) {
    console.error('getMyDocuments error:', error.message)
    res.status(500).json({ error: error.message })
  }
}

const getAllDocuments = async (req, res) => {
  try {
    const vendors = await prisma.$queryRawUnsafe(
      `SELECT v.*, u.name as "userName", u.email as "userEmail" FROM "Vendor" v LEFT JOIN "User" u ON v."userId" = u.id ORDER BY v."createdAt" DESC`
    )
    const vendorIds = vendors.map(v => v.id)
    let documents = []
    if (vendorIds.length > 0) {
      documents = await prisma.$queryRawUnsafe(
        `SELECT * FROM "VendorDocument" WHERE "vendorId" = ANY($1::text[]) ORDER BY "uploadedAt" DESC`,
        vendorIds
      )
    }
    const result = vendors.map(v => ({
      ...v,
      user: { name: v.userName, email: v.userEmail },
      documents: documents.filter(d => d.vendorId === v.id)
    }))
    res.json(result)
  } catch (error) {
    console.error('getAllDocuments error:', error.message)
    res.status(500).json({ error: error.message })
  }
}

const reviewDocument = async (req, res) => {
  try {
    const { status, note } = req.body
    if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const now = new Date().toISOString()
    await prisma.$executeRawUnsafe(
      `UPDATE "VendorDocument" SET "status" = $1::text::"DocumentStatus", "note" = $2, "reviewedAt" = $3 WHERE id = $4`,
      status, note || null, now, req.params.id
    )

    const docs = await prisma.$queryRawUnsafe(`SELECT * FROM "VendorDocument" WHERE id = $1`, req.params.id)
    const document = docs[0]
    if (!document) return res.status(404).json({ error: 'Document not found' })

    const requiredDocs = ['CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID']
    const allDocs = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VendorDocument" WHERE "vendorId" = $1`, document.vendorId
    )
    const allRequiredApproved = requiredDocs.every(type =>
      allDocs.some(d => d.docType === type && d.status === 'APPROVED')
    )

    if (allRequiredApproved) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Vendor" SET "status" = 'APPROVED', "isVerified" = true WHERE id = $1`,
        document.vendorId
      )
      const vendorData = await prisma.$queryRawUnsafe(
        `SELECT v.*, u.email as "userEmail", u.name as "userName" FROM "Vendor" v LEFT JOIN "User" u ON v."userId" = u.id WHERE v.id = $1`,
        document.vendorId
      )
      if (vendorData[0]?.userEmail) {
        sendVendorStatusEmail(vendorData[0].userEmail, vendorData[0].userName, vendorData[0].storeName, 'APPROVED', null)
      }
    }

    res.json({ message: `Document ${status.toLowerCase()}`, document, vendorFullyApproved: allRequiredApproved })
  } catch (error) {
    console.error('reviewDocument error:', error.message)
    res.status(500).json({ error: error.message })
  }
}

const getVendorBankDetails = async (req, res) => {
  try {
    const vendors = await prisma.$queryRawUnsafe(
      `SELECT v.*, u.name, u.email FROM "Vendor" v LEFT JOIN "User" u ON v."userId" = u.id WHERE v.id = $1`,
      req.params.vendorId
    )
    if (!vendors.length) return res.status(404).json({ error: 'Vendor not found' })
    res.json(vendors[0])
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { upload, uploadDocument, getMyDocuments, getAllDocuments, reviewDocument, getVendorBankDetails }