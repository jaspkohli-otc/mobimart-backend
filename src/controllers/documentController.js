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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Only PDF, JPG, PNG files allowed'), false)
  }
})

// ✅ Vendor — upload a KYC document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { docType, docName } = req.body
    const validTypes = ['CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID', 'CONTRACT_COPY']
    if (!validTypes.includes(docType)) {
      return res.status(400).json({ error: 'Invalid document type' })
    }

    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'No store found' })

    // Upload to Cloudinary
    const fileUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mobimart/kyc-documents',
          resource_type: 'auto',
          public_id: `${vendor.id}_${docType}_${Date.now()}`
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result.secure_url)
        }
      )
      Readable.from(req.file.buffer).pipe(uploadStream)
    })

    // Check if this docType already exists — if so, replace it (re-upload)
    const existing = await prisma.vendorDocument.findFirst({
      where: { vendorId: vendor.id, docType }
    })

    let document
    if (existing) {
      document = await prisma.vendorDocument.update({
        where: { id: existing.id },
        data: {
          docName: docName || req.file.originalname,
          fileUrl,
          status: 'PENDING',
          note: null,
          uploadedAt: new Date(),
          reviewedAt: null
        }
      })
    } else {
      document = await prisma.vendorDocument.create({
        data: {
          vendorId: vendor.id,
          docType,
          docName: docName || req.file.originalname,
          fileUrl,
          status: 'PENDING'
        }
      })
    }

    res.status(201).json({ message: 'Document uploaded successfully', document })
  } catch (error) {
    console.error('Document upload error:', error)
    res.status(500).json({ error: 'Document upload failed' })
  }
}

// ✅ Vendor — get my documents
const getMyDocuments = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(404).json({ error: 'No store found' })

    const documents = await prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(documents)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — get ALL vendor documents grouped by vendor
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
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — approve or reject a document
const reviewDocument = async (req, res) => {
  try {
    const { status, note } = req.body
    const validStatuses = ['APPROVED', 'REJECTED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use APPROVED or REJECTED' })
    }

    const document = await prisma.vendorDocument.update({
      where: { id: req.params.id },
      data: { status, note: note || null, reviewedAt: new Date() },
      include: { vendor: { include: { user: true } } }
    })

    // After reviewing, check if ALL required docs are approved
    // Required: CR_COPY, TRADE_LICENSE, SIGNATORY_QID (CONTRACT_COPY is optional)
    const requiredDocs = ['CR_COPY', 'TRADE_LICENSE', 'SIGNATORY_QID']
    const allDocs = await prisma.vendorDocument.findMany({
      where: { vendorId: document.vendorId }
    })

    const allRequiredApproved = requiredDocs.every(type =>
      allDocs.some(d => d.docType === type && d.status === 'APPROVED')
    )

    // If all required docs approved → set vendor to APPROVED and products live
    if (allRequiredApproved) {
      await prisma.vendor.update({
        where: { id: document.vendorId },
        data: { status: 'APPROVED', isVerified: true }
      })

      // Send approval email to vendor
      const vendor = document.vendor
      if (vendor?.user?.email) {
        sendVendorStatusEmail(
          vendor.user.email,
          vendor.user.name,
          vendor.storeName,
          'APPROVED',
          null
        )
      }
    }

    // If a required doc is rejected → notify vendor
    if (status === 'REJECTED' && document.vendor?.user?.email) {
      // Send email about rejected document
      const vendor = document.vendor
      sendVendorDocRejectedEmail(
        vendor.user.email,
        vendor.user.name,
        vendor.storeName,
        document.docType,
        note
      )
    }

    res.json({
      message: `Document ${status.toLowerCase()}`,
      document,
      vendorFullyApproved: allRequiredApproved
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Admin — update vendor bank details visibility / notes
const getVendorBankDetails = async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.vendorId },
      select: {
        id: true, storeName: true, ibanNumber: true,
        bankName: true, accountHolderName: true,
        accountNumber: true, bankBranch: true,
        user: { select: { name: true, email: true } }
      }
    })
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' })
    res.json(vendor)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// Helper — send doc rejected email
const sendVendorDocRejectedEmail = async (email, name, storeName, docType, note) => {
  try {
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    })

    const docLabel = {
      CR_COPY: 'Commercial Registration (CR) Copy',
      TRADE_LICENSE: 'Trade License',
      SIGNATORY_QID: 'Authorized Signatory QID',
      CONTRACT_COPY: 'Contract Copy'
    }[docType] || docType

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:28px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0">by JASPR Trading</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#ef4444">❌ Document Requires Attention</h2>
          <p style="color:#555">Hi <strong>${name}</strong>,</p>
          <p style="color:#555">Your document <strong>${docLabel}</strong> for store <strong>${storeName}</strong> could not be approved.</p>
          ${note ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0;font-weight:600;color:#991b1b">Reason:</p>
            <p style="margin:8px 0 0;color:#991b1b">${note}</p>
          </div>` : ''}
          <p style="color:#555">Please log in to your vendor dashboard and re-upload the correct document.</p>
          <a href="https://mobimart-frontend-app.vercel.app/vendor" style="display:inline-block;background:#f97316;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">Go to My Documents →</a>
        </div>
        <div style="background:#0f1923;padding:20px;text-align:center">
          <p style="color:#f97316;font-size:16px;font-weight:700;margin:0">MobiMart by JASPR Trading</p>
          <p style="color:#555;font-size:11px;margin:8px 0 0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>`

    await transporter.sendMail({
      from: `"MobiMart Qatar" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `❌ Document Requires Attention — ${docLabel} | MobiMart`,
      html
    })
  } catch (err) {
    console.error('Doc rejected email error:', err.message)
  }
}

module.exports = { upload, uploadDocument, getMyDocuments, getAllDocuments, reviewDocument, getVendorBankDetails }
