const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')

const {
  createVendorSubscriptionPayment,
  createOrderPayment,
  verifyPayment
} = require('../controllers/paymentController')

// Initiate a vendor subscription payment → returns hosted invoice URL
router.post('/vendor-subscription', createVendorSubscriptionPayment)

// Initiate a customer order payment → returns hosted invoice URL (needs login)
router.post('/order', authenticate, createOrderPayment)

// Verify a payment result (called from frontend callback page)
router.post('/verify', verifyPayment)

module.exports = router
