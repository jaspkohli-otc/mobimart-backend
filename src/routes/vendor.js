const express = require('express')
const router = express.Router()
const { createStore, getMyStore, getAllVendors, uploadImage, bulkUpload, upload } = require('../controllers/vendorController')
const { authenticate } = require('../middleware/auth')

router.post('/store', authenticate, createStore)
router.get('/store', authenticate, getMyStore)
router.get('/', getAllVendors)
router.post('/upload-image', authenticate, upload.single('image'), uploadImage)
router.post('/bulk-upload', authenticate, upload.single('excel'), bulkUpload)

module.exports = router