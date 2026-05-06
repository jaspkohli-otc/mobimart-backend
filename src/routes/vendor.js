const express = require('express')
const router = express.Router()
const {
  createStore, getMyStore, getAllVendors,
  uploadImage, bulkUpload, upload,
  getMyEarnings, updateIban,
  getAdminPayouts, markPayoutPaid
} = require('../controllers/vendorController')
const { authenticate } = require('../middleware/auth')

router.post('/store', authenticate, createStore)
router.get('/store', authenticate, getMyStore)
router.get('/', getAllVendors)
router.post('/upload-image', authenticate, upload.single('image'), uploadImage)
router.post('/bulk-upload', authenticate, upload.single('excel'), bulkUpload)

// ✅ Vendor earnings & IBAN
router.get('/earnings', authenticate, getMyEarnings)
router.put('/iban', authenticate, updateIban)

// ✅ Admin payouts
router.get('/admin/payouts', authenticate, getAdminPayouts)
router.post('/admin/payouts', authenticate, markPayoutPaid)

module.exports = router
