const express = require('express')
const router = express.Router()
const {
  createStore, getMyStore, getAllVendors,
  uploadImage, bulkUpload, upload,
  getMyEarnings, updateIban, updateBankDetails,
  getAdminPayouts, markPayoutPaid,
  updateVendorStatus, addSubscription
} = require('../controllers/vendorController')
const {
  upload: docUpload,
  uploadDocument,
  getMyDocuments,
  getAllDocuments,
  reviewDocument,
  getVendorBankDetails
} = require('../controllers/documentController')
const { authenticate, requireAdmin } = require('../middleware/auth')

// ✅ Vendor store
router.post('/store', authenticate, createStore)
router.get('/store', authenticate, getMyStore)
router.get('/', getAllVendors)

// ✅ Vendor image + bulk upload
router.post('/upload-image', authenticate, upload.single('image'), uploadImage)
router.post('/bulk-upload', authenticate, upload.single('excel'), bulkUpload)

// ✅ Vendor earnings & IBAN
router.get('/earnings', authenticate, getMyEarnings)
router.put('/iban', authenticate, updateIban)

// ✅ Vendor bank details
router.post('/bank-details', authenticate, updateBankDetails)

// ✅ Vendor KYC documents
router.post('/documents/upload', authenticate, docUpload.single('document'), uploadDocument)
router.get('/documents', authenticate, getMyDocuments)

// ✅ Admin — payouts
router.get('/admin/payouts', authenticate, requireAdmin, getAdminPayouts)
router.post('/admin/payouts', authenticate, requireAdmin, markPayoutPaid)

// ✅ Admin — vendor approval
router.post('/admin/status', authenticate, requireAdmin, updateVendorStatus)

// ✅ Admin — subscription
router.post('/admin/subscription', authenticate, requireAdmin, addSubscription)

// ✅ Admin — KYC documents
router.get('/admin/documents', authenticate, requireAdmin, getAllDocuments)
router.put('/admin/documents/:id', authenticate, requireAdmin, reviewDocument)
router.get('/admin/vendors/:vendorId/bank', authenticate, requireAdmin, getVendorBankDetails)

module.exports = router
