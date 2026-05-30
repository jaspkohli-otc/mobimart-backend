const express = require('express')
const router = express.Router()
const {
  placeOrder, getMyOrders, getOrder,
  getAllOrders, updateOrderStatus, getStats,
  getAllUsers, getAllVendorsAdmin, updateUserApprovalStatus,
  getMyVendorOrders
} = require('../controllers/orderController')
const { authenticate, requireAdmin } = require('../middleware/auth')

// ✅ Admin routes MUST come before /:id routes
router.get('/admin/stats', authenticate, requireAdmin, getStats)
router.get('/admin/all-orders', authenticate, requireAdmin, getAllOrders)
router.get('/admin/users', authenticate, requireAdmin, getAllUsers)
router.get('/admin/vendors', authenticate, requireAdmin, getAllVendorsAdmin)
router.put(
  '/admin/users/:id/status',
  authenticate,
  requireAdmin,
  updateUserApprovalStatus
)

// Vendor — orders containing this vendor's products (must be before /:id)
router.get('/vendor-orders', authenticate, getMyVendorOrders)

// Customer routes
router.post('/', authenticate, placeOrder)
router.get('/', authenticate, getMyOrders)
router.get('/:id', authenticate, getOrder)

// Vendor + Admin — update order status
router.put('/:id/status', authenticate, updateOrderStatus)

module.exports = router